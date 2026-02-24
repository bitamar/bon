# T12 — SHAAM Abstraction & Token Management

**Status**: 📝 Needs spec work (Architect pass required)
**Phase**: 4 — SHAAM Integration
**Requires**: T08-D merged (needs finalized invoices; does NOT depend on T11 email)
**Blocks**: T13

**Dependency correction**: This ticket was previously listed as depending on T11 (email delivery). SHAAM has nothing to do with email. The actual dependency is T08-D (finalized invoices must exist). This allows SHAAM work to start in parallel with PDF/email work (Stream C).

---

## What & Why

SHAAM is Israel's Tax Authority system for electronic invoice allocation numbers. Invoices above a threshold (currently ₪10,000 excl. VAT, dropping to ₪5,000 in June 2026) issued to licensed dealers must have an allocation number before they are legally valid.

This ticket builds the abstraction layer + OAuth2 token management. No real SHAAM calls yet — that's T13. The point is to define the interface cleanly so the real client, sandbox client, and mock client are all swappable.

---

## Recommended PR Split

- **PR 1 — Interface + trigger logic + mock client**: `ShaamService` interface, `AllocationResult` Zod schemas in `types/src/shaam.ts`, `ShaamMockClient`, `requiresAllocationNumber()` + `shouldRequestAllocation()` + `currentThreshold()` pure functions, unit tests
- **PR 2 — Token management + credentials table**: Migration for `business_shaam_credentials`, repository, encryption/decryption utilities, token refresh logic skeleton, env vars, tests

---

## Acceptance Criteria

### ShaamService Interface

- [ ] `ShaamService` interface defined in `api/src/lib/shaam/types.ts`:
  ```typescript
  interface ShaamService {
    requestAllocationNumber(
      businessId: string,
      invoice: FinalizedInvoice,
      lineItems: InvoiceItem[]
    ): Promise<AllocationResult>;

    acquireEmergencyNumbers(
      businessId: string,
      count: number
    ): Promise<EmergencyNumber[]>;

    reportEmergencyUsage(
      businessId: string,
      usedNumbers: string[]
    ): Promise<void>;
  }

  type AllocationResult =
    | { status: 'approved'; allocationNumber: string }
    | { status: 'rejected'; errorCode: string; errorMessage: string }
    | { status: 'emergency'; emergencyNumber: string }
    | { status: 'deferred'; reason: string };
  ```
- [ ] Zod schemas for `AllocationResult` and related types in `types/src/shaam.ts`

### Three Implementations

- [ ] `ShaamMockClient` — returns fake allocation numbers instantly:
  - `requestAllocationNumber()` → `{ status: 'approved', allocationNumber: 'MOCK-000000001' }` (incrementing via in-memory counter)
  - `acquireEmergencyNumbers()` → array of fake `EMRG-MOCK-XXXXXX` numbers
  - `reportEmergencyUsage()` → no-op, logs call
  - Logs all calls for debugging
- [ ] `ShaamSandboxClient` — calls ITA sandbox (skeleton only in this ticket — method bodies throw `not implemented`; real HTTP wired in T13)
- [ ] `ShaamApiClient` — calls ITA production (skeleton only — same pattern as sandbox)

### SHAAM Mode Toggle

- [ ] `SHAAM_MODE` env var added to `api/src/env.ts`: `z.enum(['mock', 'sandbox', 'production']).default('mock')`
- [ ] Factory function `createShaamService(config): ShaamService` in `api/src/lib/shaam/factory.ts` — returns the correct implementation based on `SHAAM_MODE`
- [ ] Registered as Fastify decorator via plugin: `app.decorate('shaamService', createShaamService(app.config))`

### Trigger Logic (pure functions)

- [ ] `requiresAllocationNumber(invoice, customer, business): boolean` in `api/src/lib/shaam/trigger.ts`:
  ```typescript
  function requiresAllocationNumber(
    invoice: { vatMinorUnits: number; totalExclVatMinorUnits: number },
    customer: { isLicensedDealer: boolean },
    business: { alwaysRequestAllocation?: boolean }
  ): boolean {
    if (invoice.vatMinorUnits === 0) return false;
    if (!customer.isLicensedDealer) return false;
    if (invoice.totalExclVatMinorUnits <= currentThreshold()) return false;
    return true;
  }
  ```
- [ ] `shouldRequestAllocation()` — adds voluntary opt-in: `requiresAllocationNumber(...) || business.alwaysRequestAllocation`
- [ ] `currentThreshold(): number` — returns current threshold in minor units based on date:
  - Before 2026-01-01: 2_000_000 (₪20,000)
  - 2026-01-01 to 2026-05-31: 1_000_000 (₪10,000)
  - From 2026-06-01: 500_000 (₪5,000)
- [ ] Unit tests for trigger logic: threshold boundary tests, `isLicensedDealer` false bypass, VAT=0 bypass, voluntary opt-in, date boundary edge cases

### Token Management (business_shaam_credentials)

- [ ] Migration creates `business_shaam_credentials` table:
  ```
  businessId        uuid FK → businesses (UNIQUE, ON DELETE CASCADE)
  accessToken       text NOT NULL           — encrypted (AES-256-GCM)
  refreshToken      text NOT NULL           — encrypted (AES-256-GCM)
  tokenExpiresAt    timestamp with tz NOT NULL
  scope             text
  needsReauth       boolean NOT NULL DEFAULT false
  createdAt         timestamp with tz NOT NULL DEFAULT now()
  updatedAt         timestamp with tz NOT NULL DEFAULT now()
  ```
- [ ] Drizzle schema in `api/src/db/schema.ts`
- [ ] Repository in `api/src/repositories/shaam-credentials-repository.ts`:
  - `findByBusinessId(businessId): Promise<ShaamCredentials | null>`
  - `upsert(businessId, data): Promise<ShaamCredentials>`
  - `markNeedsReauth(businessId): Promise<void>`
  - `findExpiringSoon(minutesBeforeExpiry: number): Promise<ShaamCredentials[]>`
- [ ] Update `api/tests/utils/db.ts` to include new table in `resetDb`

### Encryption

- [ ] `SHAAM_ENCRYPTION_KEY` env var — 32-byte hex string for AES-256-GCM, optional (required when `SHAAM_MODE !== 'mock'`)
- [ ] Encryption utilities in `api/src/lib/shaam/crypto.ts`:
  ```typescript
  function encrypt(plaintext: string, key: Buffer): string   // returns "iv:ciphertext:tag" base64
  function decrypt(encrypted: string, key: Buffer): string
  ```
- [ ] Key validated at startup: must be exactly 64 hex chars = 32 bytes
- [ ] In mock mode: encryption key is optional — `ShaamMockClient` doesn't store real tokens
- [ ] Unit test: encrypt → decrypt round-trip

### Token Refresh Logic

- [ ] `refreshShaamToken(businessId)` skeleton in `api/src/lib/shaam/token-refresh.ts`:
  1. Load credentials from DB
  2. If `tokenExpiresAt` > now + 5 minutes: no-op (token still valid)
  3. Call ITA OAuth2 refresh endpoint with `refreshToken` (actual HTTP call wired in T13)
  4. On success: encrypt new tokens, update DB row
  5. On failure: call `markNeedsReauth(businessId)`, log error
- [ ] Token refresh runs as a scheduled job (T-CRON-01 Part 5), NOT inline during allocation requests
- [ ] When `needsReauth = true`: business settings page shows warning banner (UI deferred to T13 or later)

### OAuth2 Authorization Flow (UI)

- [ ] **Not implemented in this ticket** — just the data model and interface
- [ ] Document the expected flow for T13: settings page → "התחבר לשע"מ" button → redirect to ITA OAuth2 authorize URL → ITA redirects back to callback URL → callback stores encrypted tokens
- [ ] Add `SHAAM_CLIENT_ID` and `SHAAM_CLIENT_SECRET` env vars (optional, required when SHAAM_MODE !== 'mock')

### General

- [ ] `npm run check` passes
- [ ] Tests: trigger logic (6+ cases), mock client returns expected results, encryption round-trip, repository CRUD

---

## Threshold Schedule

| From | Threshold (excl. VAT) | Minor units |
|------|----------------------|-------------|
| Now (2025) | > ₪20,000 | > 2,000,000 |
| Jan 2026 | > ₪10,000 | > 1,000,000 |
| Jun 2026 | > ₪5,000 | > 500,000 |

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
