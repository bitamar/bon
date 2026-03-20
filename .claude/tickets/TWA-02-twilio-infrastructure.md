# TWA-02: Twilio WhatsApp Infrastructure

## Status: ⬜ Not started

## Summary

Twilio SDK integration, WhatsApp service abstraction (mock/production), Twilio-specific phone utilities, and Fastify plugin. The plumbing — no business logic, no LLM, no webhooks.

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

   **`sandbox` mode**: Uses real Twilio credentials with the Twilio Sandbox number. Identical to `production` in code — the only difference is the `TWILIO_WHATSAPP_FROM` number (Twilio provides a sandbox number). Useful for testing with real WhatsApp without a registered business number.

### Phone Utilities (Twilio-specific)

3. **`api/src/lib/phone.ts`** — Twilio-specific utilities (NOT in `types/` — these are API-only):
   - `stripWhatsAppPrefix(twilioFrom: string): string` — `'whatsapp:+972521234567'` → `'+972521234567'`
   - `formatWhatsAppTo(e164: string): string` — `'+972521234567'` → `'whatsapp:+972521234567'`

   Note: General phone validation and E.164 normalization live in `types/src/phone.ts` (added in TWA-01). This file only has Twilio-specific `whatsapp:` prefix handling.

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
   - Prepends `whatsapp:` prefix to E.164 phone
   - Calls `client.messages.create({ from, to, body })`
   - Maps Twilio error codes to `retryable` flag:
     - 63032 (opted out) → `retryable: false`
     - 63016 (outside 24h window) → `retryable: false`
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

### CI Compatibility

8. **`.github/workflows/ci.yml`** already has `TWILIO_WHATSAPP_FROM: whatsapp:+15555550100` in env. Verify that `WHATSAPP_MODE` defaults to `mock` in CI so tests don't require real Twilio credentials.

### Tests

9. **`api/tests/lib/phone.test.ts`** — `stripWhatsAppPrefix`, `formatWhatsAppTo` edge cases
10. **`api/tests/services/whatsapp/twilio-client.test.ts`** — Mock Twilio SDK, verify message creation, error code mapping (including 63016)
11. **`api/tests/services/whatsapp/mock-client.test.ts`** — Verify in-memory storage, SID generation

## Acceptance Criteria

- [ ] `WHATSAPP_MODE=mock` works without Twilio credentials
- [ ] `WHATSAPP_MODE=sandbox|production` requires all three Twilio env vars (validated at startup)
- [ ] `sandbox` and `production` modes are functionally identical (differ only by configured number)
- [ ] Service accessible as `app.whatsapp` in route handlers
- [ ] Twilio error codes mapped to `retryable` boolean (including 63016 outside-window)
- [ ] All new code has tests
- [ ] CI runs with `WHATSAPP_MODE=mock` by default
- [ ] `npm run check` passes

## Size

~200 lines production code + ~120 lines tests. Medium ticket.

## Dependencies

- TWA-01 (phone validation and E.164 normalization in `types/src/phone.ts`)
