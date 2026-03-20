# TWA-02: Twilio WhatsApp Infrastructure

## Status: ⬜ Not started

## Summary

Twilio SDK integration, WhatsApp service abstraction (mock/production), phone normalization utilities, and Fastify plugin. The plumbing — no business logic, no LLM, no webhooks.

## Why

All WhatsApp features need a reliable messaging layer. Building the abstraction first lets TWA-03+ focus on business logic.

## Scope

### Dependencies (npm)

1. **`twilio`** — Twilio Node.js SDK. Install in `api/` workspace.

### Environment Variables

2. **`api/src/env.ts`** — Add with conditional `superRefine` (same pattern as SHAAM/Meshulam):
   - `WHATSAPP_MODE` — `mock | sandbox | production` (default: `mock`)
   - `TWILIO_ACCOUNT_SID` — required when mode ≠ mock
   - `TWILIO_AUTH_TOKEN` — required when mode ≠ mock
   - `TWILIO_WHATSAPP_FROM` — BON's sender number, format `whatsapp:+972XXXXXXXXX`, required when mode ≠ mock

### Phone Normalization

3. **`types/src/phone.ts`** — Pure functions, no dependencies:
   - `normalizeToE164(israeliPhone: string): string` — `'0521234567'` → `'+972521234567'`, `'972521234567'` → `'+972521234567'`
   - `stripWhatsAppPrefix(twilioFrom: string): string` — `'whatsapp:+972521234567'` → `'+972521234567'`
   - `formatWhatsAppTo(e164: string): string` — `'+972521234567'` → `'whatsapp:+972521234567'`

### Service Layer

4. **`api/src/services/whatsapp/types.ts`** — Interface:
   ```typescript
   interface WhatsAppService {
     sendMessage(to: string, body: string): Promise<WhatsAppSendResult>;
   }

   type WhatsAppSendResult =
     | { status: 'sent'; messageSid: string }
     | { status: 'failed'; error: string; retryable: boolean };
   ```

5. **`api/src/services/whatsapp/twilio-client.ts`** — Production implementation:
   - Normalizes phone to E.164, prepends `whatsapp:` prefix
   - Calls `client.messages.create({ from, to, body })`
   - Maps Twilio error codes to `retryable` flag:
     - 63032 (opted out) → `retryable: false`
     - 20429 (rate limit) → `retryable: true`
     - 21211 (invalid number) → `retryable: false`
     - All others → `retryable: true`

6. **`api/src/services/whatsapp/mock-client.ts`** — Dev/test implementation:
   - Logs to console
   - Stores messages in `sentMessages: Array<{ to, body, sid }>` (inspectable in tests)
   - Returns fake SIDs via `crypto.randomUUID()`

### Fastify Plugin

7. **`api/src/plugins/whatsapp.ts`**:
   - Factory creates mock or Twilio client based on `WHATSAPP_MODE`
   - `app.decorate('whatsapp', whatsappService)`
   - Type declaration: `FastifyInstance.whatsapp: WhatsAppService`

### Tests

8. **`types/tests/phone.test.ts`** — All Israeli mobile prefixes (050–059), landline, edge cases (already E.164, missing leading zero)
9. **`api/tests/services/whatsapp/twilio-client.test.ts`** — Mock Twilio SDK, verify message creation, error code mapping
10. **`api/tests/services/whatsapp/mock-client.test.ts`** — Verify in-memory storage, SID generation

## Acceptance Criteria

- [ ] `WHATSAPP_MODE=mock` works without Twilio credentials
- [ ] `WHATSAPP_MODE=production` requires all three Twilio env vars (validated at startup)
- [ ] Phone normalization handles all Israeli mobile formats
- [ ] Service accessible as `app.whatsapp` in route handlers
- [ ] Twilio error codes mapped to `retryable` boolean
- [ ] All new code has tests
- [ ] `npm run check` passes

## Size

~250 lines production code + ~150 lines tests. Medium ticket.

## Dependencies

- TWA-01 (phone number exists on business)
