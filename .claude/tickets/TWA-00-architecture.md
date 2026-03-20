# TWA-00: WhatsApp + LLM Architecture Overview

## Vision

Every BON feature is accessible via WhatsApp. A user texts in Hebrew, an LLM understands intent, calls internal services via tools, and replies conversationally. Invoice creation is first. Customer management, payments, reports, and settings follow — each as a new tool registration, not a new architecture.

## The fundamental constraint

Twilio expects a 200 response within 15 seconds. LLM calls take 3–10 seconds. At 100 concurrent users you hit Anthropic rate limits and timeout every webhook. You cannot call an LLM inside a webhook handler.

## Architecture: webhook → job queue → LLM → reply

Same outbox pattern used for SHAAM allocation and email sending:

```text
Twilio webhook
    │
    ▼
POST /webhooks/whatsapp
    │ validate signature (HMAC-SHA1, timingSafeEqual)
    │ parse inbound (From, Body, MessageSid)
    │ resolve phone → user (via users.phone unique index)
    │ resolve/create conversation for this user
    │ INSERT whatsapp_messages ON CONFLICT (twilioSid) DO NOTHING
    │ boss.send('process-whatsapp-message', { conversationId, messageId })
    │ return 200 immediately (~5ms)
    │
    ▼
pg-boss worker (teamSize: 5)
    │ load conversation + recent messages from DB
    │ reconstruct Claude message array
    │ append new inbound message
    │
    │ ┌─── tool loop ───────────────────────────────────┐
    │ │ call Claude API with messages + tools + system   │
    │ │                                                  │
    │ │ if response is text → break                      │
    │ │ if response has tool_use blocks:                  │
    │ │   execute each tool (internal service call)       │
    │ │   store tool_call + tool_result rows in DB        │
    │ │   append to message array, continue loop          │
    │ │                                                  │
    │ │ max 10 iterations → break with error              │
    │ └──────────────────────────────────────────────────┘
    │
    │ store assistant message in DB
    │ boss.send('send-whatsapp-reply', { conversationId, body, to })
    │
    ▼
pg-boss worker (send-whatsapp-reply)
    │ call Twilio API
    │ store outbound message row with twilioSid
    │ on failure: pg-boss retries (LLM response safe in DB)
```

Two separate jobs for processing and sending. If Twilio is down, the LLM response is never lost — it stays in the DB and the send job retries independently.

## Concurrency model

- **Webhook handler**: ~5ms each. Fastify handles 100 concurrent trivially.
- **`singletonKey: conversationId`** on `process-whatsapp-message`: pg-boss runs one job per conversation at a time. If a user sends 3 messages quickly, they queue and process in order. Different users process in parallel.
- **`teamSize: 5`**: At most 5 concurrent LLM calls. With ~5s average latency, throughput is ~1 msg/sec. 100 simultaneous messages drain in ~100 seconds. WhatsApp is async — this is acceptable.
- **Anthropic rate limits**: Sonnet at 5 concurrent × ~4K tokens/call ≈ 60 RPM, ~240K tokens/min. Well within production tier limits. Scale by increasing `teamSize` and upgrading Anthropic tier.

## Identity model: phone → user → business

WhatsApp identity lives on `users.phone` (E.164, unique). `businesses.phone` is a separate, unrelated field — it's display-only text printed on invoice PDFs and has no role in the WhatsApp flow. The two must never be confused.

```text
inbound phone (+972521234567)
    │
    ▼
users.phone (partial unique index, stored as E.164)
    │  → resolves to a specific user directly (no format conversion)
    │
    ▼
user_businesses (userId + businessId + role)
    │
    ├── 1 business  → auto-select, store as activeBusinessId on conversation
    └── N businesses → LLM asks user to pick via select_business tool
                       → store selection as activeBusinessId on conversation
```

This gives us:
- **Identity**: `userId` for audit trails (`recordedByUserId` on payments, etc.)
- **Role enforcement**: check `user_businesses.role` before destructive operations
- **Multi-tenant**: user picks which business to operate on; can switch mid-conversation

**Stale business guard**: At the start of each `process-whatsapp-message` job, re-check that the user is still a member of `activeBusinessId` (via `user_businesses`). If not (admin removed them), clear `activeBusinessId` and let the LLM prompt for a new selection. This prevents tool calls against a business the user no longer belongs to.

## Database schema

### `whatsapp_conversations`

```sql
id                uuid PK
userId            uuid FK → users (NOT businesses)
phone             text NOT NULL (E.164 format)
activeBusinessId  uuid FK → businesses NULLABLE
                  -- set on first message (auto if 1 business, or after user picks)
                  -- user can switch with select_business tool
status            enum: active | idle | blocked
lastActivityAt    timestamp with tz
createdAt         timestamp with tz

UNIQUE (userId)   -- one conversation per user
INDEX ON (phone)
```

### `whatsapp_messages`

```sql
id              uuid PK
conversationId  uuid FK → whatsapp_conversations
twilioSid       text UNIQUE NULLABLE  -- inbound only, idempotency key
direction       enum: inbound | outbound
llmRole         enum: user | assistant | tool_call | tool_result
toolName        text NULLABLE
toolCallId      text NULLABLE  -- Claude's tool_use id
body            text NOT NULL  -- for tool_call: JSON.stringify(input); for tool_result: result string
metadata        jsonb NULLABLE  -- raw Twilio fields, notification dedup keys, etc.
createdAt       timestamp with tz
```

`llmRole` drives context reconstruction. Select messages ordered by `createdAt`, map each row to its Claude API message shape. `tool_call` rows → `{ role: 'assistant', content: [{ type: 'tool_use', ... }] }`. `tool_result` rows → `{ role: 'user', content: [{ type: 'tool_result', ... }] }`.

**Multi-tool grouping**: Claude can return multiple `tool_use` blocks in a single response. Each is stored as a separate `tool_call` row. The context builder must re-aggregate consecutive `tool_call` rows into a single `assistant` message with multiple `tool_use` content blocks. Similarly, their matching `tool_result` rows must be grouped into a single `user` message.

### `whatsapp_pending_actions`

```sql
id              uuid PK
conversationId  uuid FK
actionType      text NOT NULL  -- 'finalize_invoice', 'delete_customer', etc.
payload         jsonb NOT NULL  -- { invoiceId: string }
expiresAt       timestamp with tz  -- 10 minutes from creation
createdAt       timestamp with tz

UNIQUE (conversationId, actionType)  -- one pending action per type per conversation
```

Confirmation guard for destructive operations. The LLM calls `request_confirmation` which inserts a row and returns a summary. When the user replies "כן", the worker finds the pending action (if not expired), executes it, clears the row. Prevents LLM hallucinations from accidentally finalizing invoices or deleting data.

The unique constraint ensures only one pending action of each type exists per conversation. A new `request_confirmation` for the same action type replaces the old one (upsert).

## Tool architecture

Tools are registered in a `ToolRegistry` — a map from tool name to `{ definition, handler }`. Each ticket adds tools to the registry. The tool loop iterates over Claude's `tool_use` blocks and dispatches to the registry.

```typescript
interface ToolDefinition {
  name: string;
  description: string;  // Hebrew — Claude sees this
  input_schema: object; // JSON Schema
}

interface ToolHandler {
  (input: unknown, context: ToolContext): Promise<string>;
}

interface ToolContext {
  userId: string;
  businessId: string;    // from conversation.activeBusinessId (must be set before tools run)
  userRole: BusinessRole; // from user_businesses — checked before destructive operations
  conversationId: string;
  logger: FastifyBaseLogger;
  boss?: PgBoss;  // Needed by tools that enqueue jobs (e.g., SHAAM allocation after finalize)
}

type ToolRegistry = Map<string, { definition: ToolDefinition; handler: ToolHandler }>;
```

Tools call the existing service layer directly (not HTTP). They run in the same process as the worker. The tool handler receives typed input (validated via Zod), calls the service, and returns a string result for Claude to see.

**Adding new WhatsApp features = adding new tools.** The webhook, job queue, tool loop, context management, and conversation state are all shared infrastructure. Future tickets (customer management, payments, reports) only need to:
1. Define new tool(s) in `api/src/services/whatsapp/tools/`
2. Register them in the tool registry
3. Add tests

## Context management

- Load last 40 messages from conversation
- Estimate token count (character count heuristic: **chars / 2** — conservative for Hebrew, which tokenizes at ~2 chars/token vs ~3.5 for English)
- If > 100K tokens, drop oldest user+assistant pairs (never mid-turn: tool_call/tool_result pairs are atomic)
- System prompt is always included, never trimmed
- Log warning when trimming occurs

## Message cleanup

Old messages accumulate indefinitely. Add a `whatsapp-message-cleanup` cron job (TWA-04, registered alongside existing cleanup jobs) that deletes messages older than 90 days. Conversations themselves are kept (they're lightweight) — only `whatsapp_messages` rows are pruned.

## System prompt

```text
אתה עוזר BON של {userName}.
העסק הפעיל: "{businessName}" (תפקיד: {userRole}).

תאריך היום: {date}
שיעור מע"מ: 17%

כללים:
- ענה תמיד בעברית, קצר וממוקד — זה WhatsApp
- לפני פעולות בלתי הפיכות (הפקת חשבונית, מחיקה), בקש אישור
- אל תחשוף מידע רגיש
- אם הבקשה לא ברורה, שאל שאלה אחת מדויקת
- פרמט סכומים כ-₪X,XXX
- אם המשתמש שייך ליותר מעסק אחד, הוא יכול להחליף עסק עם "עבור לעסק X"
```

User name, business name, and role injected at runtime. No data preloaded — tools fetch on demand.

## Failure taxonomy

| Failure | Detection | Recovery |
|---|---|---|
| Twilio delivers webhook twice | `ON CONFLICT (twilioSid) DO NOTHING` | Idempotent no-op |
| Twilio signature invalid | HMAC mismatch → 403 | No processing |
| LLM timeout / 500 | SDK throws | pg-boss retries ×3 (30s, 5min, 30min) |
| LLM 429 rate limit | SDK throws | pg-boss retries; `teamSize` prevents thundering herd |
| LLM context overflow | Token estimate check | Trim oldest turns, retry |
| Tool call error (customer not found, etc.) | Caught, returned as error string | Claude reads it and responds gracefully |
| Finalize without confirmation | `finalize_invoice` checks pending_actions | Returns error, Claude explains to user |
| Pending action expired | 10-min TTL checked | Claude explains, asks to start over |
| Twilio send fails (transient) | `send-whatsapp-reply` throws | pg-boss retries ×5; LLM response safe in DB |
| Phone not registered to any user | `users.phone` lookup returns null | Reply with "מספר זה לא מחובר לחשבון BON" via direct Twilio send, return 200 |
| User has no businesses | `user_businesses` empty for userId | Reply with "אין עסקים מחוברים לחשבון שלך" |
| User lacks permission for action | `userRole` check in tool handler | Return Hebrew error: "אין לך הרשאה לפעולה זו" — Claude relays to user |
| User opted out (Twilio 63032) | Error code check | Mark conversation `blocked`, stop sending |
| Job exhausts all retries | pg-boss marks `failed` | Best-effort direct apology message via Twilio |
| DB connection lost | Transaction rolls back | pg-boss retries; all operations idempotent |
| User sends media (image/voice/PDF) | `NumMedia > 0` | Reply "סליחה, כרגע אני מטפל רק בהודעות טקסט." via direct Twilio send, return 200 |
| User removed from business after activeBusinessId set | `user_businesses` lookup returns null at job start | Clear `activeBusinessId`, prompt to select new business |
| Tool loop exceeds 60s | AbortController timeout | Return Hebrew apology, log timeout |
| User floods messages (>10/min) | Count recent inbound messages per conversation | Drop excess with "לאט לאט 😊 עדיין מעבד את ההודעה הקודמת" |
| Proactive notification outside 24h window | Check `lastActivityAt` before enqueuing | Skip silently — user must text BON first to reopen the window |

## Ticket breakdown

```text
TWA-01: Phone on user profile + unique index  (user identity for WhatsApp)
TWA-02: Twilio infrastructure                 (service layer, plugin, env vars, phone normalization)
TWA-03: Webhook + job queue wiring            (inbound route, phone→user→business resolution, two job types)
TWA-04: Conversation state                    (DB migration, repositories, context builder, message cleanup cron)
TWA-05: LLM integration core                  (Claude client, tool loop, system prompt, tool registry + select_business)
TWA-06: Invoice creation tools                (find_customer, create_draft, add/remove_line_item, confirm, finalize)
TWA-07: Proactive outbound notifications      (invoice sent, payment received, overdue alerts — 24h window only)
```

Each ticket is independently mergeable. Build order: **TWA-01 → TWA-02 → TWA-04 → TWA-03 → TWA-05 → TWA-06**. TWA-04 must land before TWA-03 because TWA-03 needs the conversation/message tables that TWA-04 creates. TWA-07 can start after TWA-02 + TWA-04.

## Known codebase constraints

These were discovered during a deep review of the existing codebase. Every ticket implementer must be aware:

1. **Line items are full replacement, not incremental.** `updateDraft()` deletes ALL existing items and inserts the provided array. Any tool that adds/removes items must load existing items, modify the array, and pass the complete set. See `invoice-service.ts` lines 251–269.

2. **`lineItemInputSchema` requires `vatRateBasisPoints` and `position`.** These are not optional. Tools must auto-set `vatRateBasisPoints` from the business's `defaultVatRateBasisPoints` and `position` from the item index.

3. **`finalize()` does NOT enqueue SHAAM jobs.** It returns `{ needsAllocation: boolean }` — the caller must call `enqueueShaamAllocation()` if true. This is the existing pattern in `routes/invoices.ts`.

4. **`finalize()` can require a `vatExemptionReason`.** If VAT total is zero and the business is not an exempt dealer, it throws `unprocessableEntity` with code `missing_vat_exemption_reason`.

5. **`users.phone` exists but needs a unique index and E.164 format.** Column is nullable text with no constraint. TWA-01 adds a partial unique index (`WHERE phone IS NOT NULL`) and normalizes to E.164 (`+972521234567`) before storing. `businesses.phone` is a separate, unrelated field used only for invoice PDF display — it stays unchanged.

6. **Rate limiting only excludes `/health`.** The Meshulam webhook is NOT excluded from rate limiting despite what some comments suggest. The `allowList` function in `app.ts` must be updated to exclude webhook routes.

7. **`sendInvoice()` enqueues email via pg-boss (`send-invoice-email` job).** The route handler calls `sendInvoice()` which enqueues the email job. WhatsApp notifications should follow the same pattern: enqueue from the route handler after the primary action succeeds.

8. **No `payment-service.ts` exists.** Payment recording is in `invoice-service.ts` as `recordPayment()`. After recording, there are no event hooks — notifications must be triggered from the route handler.

9. **`recordPayment()` has no event/callback mechanism.** The route handler must explicitly trigger any post-payment actions (WhatsApp notifications, etc.).

10. **`overdue-detection` enqueues `overdue-digest` as follow-up.** The digest job runs after detection, not as an independent cron. If adding WhatsApp overdue notifications, hook into the detection handler (which already iterates newly-overdue invoices).

11. **`createDraft()` requires `documentType`.** It's not optional in `CreateDraftInput`. Tools must always pass it explicitly (default to `'tax_invoice'` in the tool handler).

## WhatsApp 24-hour messaging window

The WhatsApp Business API only allows free-form messages within 24 hours of the user's last inbound message. Outside this window, only pre-approved message templates can be sent.

**MVP approach**: Only send proactive notifications (TWA-07) to users whose `lastActivityAt` is within the last 24 hours. If outside the window, skip silently. This avoids the complexity of Twilio Content Templates for now.

**Future**: Register message templates via Twilio Content API for notifications outside the 24h window (overdue alerts, payment confirmations). This is a separate ticket.

## Operational notes

### Cost estimate

Per-message cost at ~4K tokens (Sonnet):
- Anthropic: ~$0.016 input + ~$0.06 output = **~$0.08/message**
- Twilio WhatsApp: ~$0.005/inbound + ~$0.005/outbound = **~$0.01/message**
- Total: **~$0.09/message**

At 100 DAU × 10 messages/day = 1,000 messages/day = **~$90/day, ~$2,700/month**. Acceptable for B2B SaaS.

### User opt-out

Users can disable WhatsApp via their profile (TWA-01 adds a `whatsappEnabled` boolean, default `true`). When disabled:
- Inbound messages get: "WhatsApp מושבת בחשבון שלך. הפעל דרך הגדרות הפרופיל."
- Proactive notifications are skipped
- Conversation status is not changed (user can re-enable)

### Per-user rate limiting

Enforce max 10 inbound messages per minute per conversation. The webhook handler counts recent inbound messages (last 60 seconds) before enqueuing. If exceeded, reply with "לאט לאט — עדיין מעבד את ההודעה הקודמת" and return 200 without enqueuing.

## Out of scope (for now)

- Media messages (images, voice, PDFs) from users — handled with a polite "text only" reply
- Group chats
- Multiple WhatsApp numbers per user
- Bot persona customization
- Inline payment via WhatsApp Pay
- Customer-facing WhatsApp (B2C) — this is B2B only (business owner interacts)
- WhatsApp message templates (needed for notifications outside 24h window)
- Monitoring dashboard / cost alerting (add after MVP)
