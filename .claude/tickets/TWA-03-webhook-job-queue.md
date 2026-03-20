# TWA-03: Inbound Webhook + Job Queue Wiring

## Status: ⬜ Not started

## Summary

Twilio webhook endpoint that receives inbound WhatsApp messages, verifies signatures, deduplicates, and enqueues processing jobs. Two new job types in pg-boss. No LLM logic — just the plumbing from Twilio to the job queue.

## Why

The webhook must respond in <15 seconds or Twilio retries. All real work happens in background jobs. This ticket sets up the reliable ingestion pipeline.

## Scope

### Webhook Route

1. **`api/src/routes/whatsapp.ts`** — `POST /webhooks/whatsapp`:
   - **No authentication** (Twilio calls this, not a logged-in user)
   - **Twilio signature verification**: Validate `X-Twilio-Signature` header using HMAC-SHA1 with `TWILIO_AUTH_TOKEN`. Use Twilio SDK's `validateRequest()`. The URL passed to `validateRequest` must be the **public-facing URL** (`env.URL + '/webhooks/whatsapp'`), not `request.url` — behind a reverse proxy these differ and signature validation will fail. Must use `timingSafeEqual`. Reject with 403 if invalid. Skip verification when `WHATSAPP_MODE=mock`.
   - **Parse inbound fields**: `From` (phone), `Body` (text), `MessageSid` (idempotency key), `NumMedia`
   - **Media handling**: If `NumMedia > 0` and `Body` is empty/missing → reply directly with "סליחה, כרגע אני מטפל רק בהודעות טקסט." via `app.whatsapp.sendMessage()` and return 200 without enqueuing. If `NumMedia > 0` but `Body` is present → process the text body normally (ignore the media).
   - **WhatsApp opt-out check**: After resolving user, check `users.whatsappEnabled`. If `false` → reply with "WhatsApp מושבת בחשבון שלך. הפעל דרך הגדרות הפרופיל." and return 200.
   - **Per-user rate limiting**: Count inbound messages for this conversation in the last 60 seconds. If > 10 → reply with "לאט לאט — עדיין מעבד את ההודעה הקודמת" and return 200 without enqueuing.
   - **Resolve user**: Strip `whatsapp:` prefix → E.164 phone. Look up `users.phone` directly (stored as E.164 since TWA-01, no format conversion needed). If no user found → reply with "מספר זה לא מחובר לחשבון BON. הירשמו באפליקציה והוסיפו מספר טלפון בפרופיל." via direct Twilio send and return 200.
   - **Resolve/create conversation**: Lookup `whatsapp_conversations` by `userId`. If none exists, create one with `userId`, `phone`, `activeBusinessId = null`. The active business is resolved later in the process handler (TWA-05): if the user has exactly one business, auto-set it; if multiple, the LLM asks the user to pick via the `select_business` tool.
   - **Insert message**: `INSERT INTO whatsapp_messages (...) ON CONFLICT (twilioSid) DO NOTHING`. If insert was a no-op (duplicate), return 200 without enqueuing.
   - **Enqueue job**: `boss.send('process-whatsapp-message', { conversationId, messageId }, { singletonKey: conversationId, retryLimit: 3, retryDelay: 30, retryBackoff: true })`
   - **Return 200** with empty body (Twilio ignores the body)

2. **Register route** in `api/src/app.ts`. Exclude `/webhooks/whatsapp` from rate limiting by updating the `allowList` to:
   ```typescript
   allowList: (req) => req.url === '/health' || req.url.startsWith('/webhooks/'),
   ```
   This covers both `/webhooks/whatsapp` and `/webhooks/meshulam` (fixing an existing gap where Meshulam webhook was not excluded).

### Job Registration

3. **`api/src/jobs/boss.ts`** — Add to `JobPayloads`:
   ```typescript
   'process-whatsapp-message': { conversationId: string; messageId: string };
   'send-whatsapp-reply': { conversationId: string; body: string; to: string };
   ```

4. **`api/src/jobs/handlers/send-whatsapp-reply.ts`** — Simple handler:
   - Call `app.whatsapp.sendMessage(to, body)`
   - If `status === 'sent'`: insert outbound message row in `whatsapp_messages` with `twilioSid`
   - If `status === 'failed'` and `retryable === true`: throw to trigger pg-boss retry
   - If `status === 'failed'` and `retryable === false`: log error, mark conversation `blocked` if error code is opt-out (63032), do NOT retry
   - Registered with `retryLimit: 5, retryDelay: 10, retryBackoff: true`

5. **`api/src/jobs/handlers/process-whatsapp-message.ts`** — Stub handler for now (TWA-05 adds LLM logic):
   - Load the message from DB
   - Log that it was received
   - Enqueue a `send-whatsapp-reply` with a placeholder: "קיבלתי את ההודעה שלך. תכונה זו בפיתוח."
   - This stub makes the full pipeline testable end-to-end before the LLM is wired

### User Lookup

6. **Phone → user resolution**: Query `users` table for `phone` column matching the inbound E.164 number. Since TWA-01 stores phone as E.164, no format conversion is needed — query directly:
   ```typescript
   findUserByPhone(e164Phone: string): Promise<UserRecord | null>
   ```
   The partial unique index on `users.phone` guarantees at most one match.

### Tests

7. **`api/tests/routes/whatsapp.test.ts`**:
   - Valid signature + known phone (registered user) → 200 + message inserted + job enqueued
   - Invalid signature → 403
   - Unknown phone number (no user with this phone) → 200 + registration prompt reply sent
   - Duplicate `MessageSid` → 200 + no job enqueued (idempotent)
   - Media-only message (NumMedia > 0, no Body) → 200 + "text only" reply
   - Media + text message → 200 + text processed normally
   - User with `whatsappEnabled: false` → 200 + opt-out reply
   - Rate limit exceeded (>10 messages/min) → 200 + throttle reply
   - User exists but has no businesses → conversation created with `activeBusinessId = null`

8. **`api/tests/jobs/handlers/send-whatsapp-reply.test.ts`**:
   - Successful send → outbound message stored
   - Retryable failure → throws (pg-boss retries)
   - Non-retryable failure → does not throw, logs error

## Acceptance Criteria

- [ ] Twilio webhook responds 200 within 5ms (no blocking work)
- [ ] Signature verification uses `env.URL + '/webhooks/whatsapp'` as the public URL
- [ ] Signature verification rejects invalid requests with 403
- [ ] Duplicate `MessageSid` is idempotent (no double processing)
- [ ] `singletonKey: conversationId` ensures one processing job per conversation
- [ ] Unregistered phone numbers get a registration prompt reply, not silence
- [ ] Media-only messages get a "text only" reply
- [ ] Users with `whatsappEnabled: false` get an opt-out reply
- [ ] Per-user rate limiting (10/min) prevents message flooding
- [ ] Phone→user resolution queries E.164 directly (no format conversion)
- [ ] Send failures retry with backoff; non-retryable errors don't retry
- [ ] Stub handler makes full pipeline testable (inbound → job → outbound)
- [ ] Route excluded from rate limiting
- [ ] `npm run check` passes

## Size

~350 lines production code + ~250 lines tests. Medium ticket.

## Dependencies

- TWA-02 (WhatsApp service for sending replies)
- **TWA-04 (hard dependency)** — conversation + message tables must exist before this ticket can be implemented or tested
