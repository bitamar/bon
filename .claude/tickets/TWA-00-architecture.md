# TWA-00: WhatsApp + LLM Architecture Overview

## Vision

Every BON feature is accessible via WhatsApp. A business owner texts in Hebrew, an LLM understands intent, calls internal services via tools, and replies conversationally. Invoice creation is first. Customer management, payments, reports, and settings follow — each as a new tool registration, not a new architecture.

## The fundamental constraint

Twilio expects a 200 response within 15 seconds. LLM calls take 3–10 seconds. At 100 concurrent users you hit Anthropic rate limits and timeout every webhook. You cannot call an LLM inside a webhook handler.

## Architecture: webhook → job queue → LLM → reply

Same outbox pattern used for SHAAM allocation and email sending:

```
Twilio webhook
    │
    ▼
POST /webhooks/whatsapp
    │ validate signature (HMAC-SHA1, timingSafeEqual)
    │ parse inbound (From, Body, MessageSid)
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

## Database schema

### `whatsapp_conversations`

```
id              uuid PK
businessId      uuid FK → businesses
phone           text NOT NULL (E.164 format)
status          enum: active | idle | blocked
lastActivityAt  timestamp with tz
createdAt       timestamp with tz

UNIQUE (phone)  -- one phone = one business
INDEX ON (phone)
```

### `whatsapp_messages`

```
id              uuid PK
conversationId  uuid FK → whatsapp_conversations
twilioSid       text UNIQUE NULLABLE  -- inbound only, idempotency key
direction       enum: inbound | outbound
llmRole         enum: user | assistant | tool_call | tool_result
toolName        text NULLABLE
toolCallId      text NULLABLE  -- Claude's tool_use id
body            text NOT NULL
metadata        jsonb NULLABLE  -- raw Twilio fields for debugging
createdAt       timestamp with tz
```

`llmRole` drives context reconstruction. Select messages ordered by `createdAt`, map each row to its Claude API message shape. `tool_call` rows → `{ role: 'assistant', content: [{ type: 'tool_use', ... }] }`. `tool_result` rows → `{ role: 'user', content: [{ type: 'tool_result', ... }] }`.

### `whatsapp_pending_actions`

```
id              uuid PK
conversationId  uuid FK
actionType      text NOT NULL  -- 'finalize_invoice', 'delete_customer', etc.
payload         jsonb NOT NULL  -- { invoiceId: string }
expiresAt       timestamp with tz  -- 10 minutes from creation
createdAt       timestamp with tz
```

Confirmation guard for destructive operations. The LLM calls `request_confirmation` which inserts a row and returns a summary. When the user replies "כן", the worker finds the pending action (if not expired), executes it, clears the row. Prevents LLM hallucinations from accidentally finalizing invoices or deleting data.

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
  businessId: string;
  conversationId: string;
  logger: FastifyBaseLogger;
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
- Estimate token count (character count heuristic: chars / 3.5)
- If > 100K tokens, drop oldest user+assistant pairs (never mid-turn: tool_call/tool_result pairs are atomic)
- System prompt is always included, never trimmed
- Log warning when trimming occurs

## System prompt

```
אתה עוזר BON לעסק "{businessName}".
תפקידך לעזור לנהל את העסק דרך WhatsApp.

תאריך היום: {date}
שיעור מע"מ: 17%

כללים:
- ענה תמיד בעברית, קצר וממוקד — זה WhatsApp
- לפני פעולות בלתי הפיכות (הפקת חשבונית, מחיקה), בקש אישור
- אל תחשוף מידע רגיש
- אם הבקשה לא ברורה, שאל שאלה אחת מדויקת
- פרמט סכומים כ-₪X,XXX
```

Business name injected at runtime. No data preloaded — tools fetch on demand.

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
| User opted out (Twilio 63032) | Error code check | Mark conversation `blocked`, stop sending |
| Job exhausts all retries | pg-boss marks `failed` | Best-effort direct apology message via Twilio |
| DB connection lost | Transaction rolls back | pg-boss retries; all operations idempotent |

## Ticket breakdown

```
TWA-01: Phone required on onboarding         ✓ (committed, needs merge)
TWA-02: Twilio infrastructure                 (service layer, plugin, env vars, phone normalization)
TWA-03: Webhook + job queue wiring            (inbound route, signature verification, two job types)
TWA-04: Conversation state                    (DB migration, repositories, context builder)
TWA-05: LLM integration core                  (Claude client, tool loop, system prompt, tool registry)
TWA-06: Invoice creation tools                (find_customer, create_draft, add_line_item, confirm, finalize)
TWA-07: Proactive outbound notifications      (invoice sent, payment received, overdue alerts)
```

Each ticket is independently mergeable. TWA-02→03→04→05 must be sequential. TWA-06 depends on TWA-05. TWA-07 is independent after TWA-02.

## Out of scope (for now)

- Media messages (images, voice, PDFs) from users
- Group chats
- Multiple WhatsApp numbers per business
- Bot persona customization
- Inline payment via WhatsApp Pay
- Customer-facing WhatsApp (B2C) — this is B2B only (business owner interacts)
