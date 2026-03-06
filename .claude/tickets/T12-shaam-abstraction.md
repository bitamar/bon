# T12 — SHAAM Abstraction & Token Management

**Status**: 🔒 Blocked (T-CRON-01 must merge first)
**Phase**: 4 — SHAAM Integration
**Requires**: T-CRON-01 merged (pg-boss infrastructure for token refresh cron job)
**Blocks**: T13

---

## Dependency Note

T12 has **zero functional dependency** on T11 (Email Delivery) or T10 (PDF Generation). The ShaamService interface, token management, and `requiresAllocationNumber()` pure function do not use email or PDF features.

The one AC that referenced email — "on refresh failure: notify owner" — cannot be implemented at T12 time regardless (email infrastructure doesn't exist yet). Instead, T12 sets a `needsReauth` flag on the credentials row; email notification is deferred to post-T11.

T12 depends on T-CRON-01 because it registers the `shaam-token-refresh` cron job handler.

---

## What & Why

SHAAM is Israel's Tax Authority system for electronic invoice allocation numbers. Invoices above a threshold (currently ₪10,000 excl. VAT as of Jan 2026, dropping to ₪5,000 in June 2026) issued to licensed dealers must have an allocation number before they are legally valid.

This ticket builds the abstraction layer + OAuth2 token management. No real SHAAM calls yet — that's T13. The point is to define the interface cleanly so the real HTTP client and mock client are swappable.

This ticket also registers the `shaam-token-refresh` cron job handler using the pg-boss infrastructure from T-CRON-01.

---

## Acceptance Criteria

### ShaamService Interface

- [ ] `ShaamService` interface defined in `api/src/services/shaam/types.ts`:
  - `requestAllocationNumber(request: AllocationRequest): Promise<AllocationResult>`
  - **No emergency methods** — those belong to T14 when the interface is extended
- [ ] `AllocationRequest` type defined with all fields T13 needs for the ITA payload:
  ```typescript
  interface AllocationRequest {
    readonly businessId: string;
    readonly invoiceId: string;
    readonly documentType: string;
    readonly documentNumber: string;
    readonly invoiceDate: string;
    readonly totalExclVatMinorUnits: number;
    readonly vatMinorUnits: number;
    readonly totalInclVatMinorUnits: number;
    readonly customerTaxId: string | null;
    readonly items: ReadonlyArray<{
      readonly description: string;
      readonly quantity: number;
      readonly unitPriceMinorUnits: number;
      readonly lineTotalMinorUnits: number;
    }>;
  }
  ```
- [ ] `AllocationResult` type:
  ```typescript
  type AllocationResult =
    | { status: 'approved'; allocationNumber: string }
    | { status: 'rejected'; errorCode: string; errorMessage: string }
    | { status: 'emergency'; emergencyNumber: string }
    | { status: 'deferred'; reason: string };
  ```

### Implementations

- [ ] Two implementations (not three):
  - `ShaamMockClient` — returns fake data for dev/test (see Mock Behavior below)
  - `ShaamHttpClient` — single class with configurable `baseUrl` (sandbox URL vs production URL). No separate ShaamSandboxClient and ShaamApiClient — they're the same code with a different URL.
- [ ] Toggle via `SHAAM_MODE=mock|sandbox|production` env var

### Environment Variables

- [ ] Add to `api/src/env.ts`:
  ```typescript
  SHAAM_MODE: z.enum(['mock', 'sandbox', 'production']).default('mock'),
  SHAAM_ENCRYPTION_KEY: z.string().length(64).optional(),  // hex-encoded 32-byte key
  ```
- [ ] `SHAAM_ENCRYPTION_KEY` is **optional** — required only when `SHAAM_MODE !== 'mock'`
- [ ] Validation: if `SHAAM_MODE` is `sandbox` or `production`, `SHAAM_ENCRYPTION_KEY` must be provided (use `.superRefine()`)

### Credentials Table

- [ ] `business_shaam_credentials` table (Drizzle schema + migration):
  ```typescript
  businessShaamCredentials = pgTable('business_shaam_credentials', {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' })
      .unique(),
    encryptedAccessToken: text('encrypted_access_token').notNull(),
    encryptedRefreshToken: text('encrypted_refresh_token').notNull(),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }).notNull(),
    scope: text('scope'),
    needsReauth: boolean('needs_reauth').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  });
  ```
- [ ] 1:1 with businesses (UNIQUE on `businessId`, CASCADE on delete)
- [ ] Column names use `encrypted` prefix to make encryption explicit

### Token Encryption

- [ ] Encrypt/decrypt helpers in `api/src/lib/crypto.ts`:
  - `encrypt(plaintext: string, hexKey: string): string`
  - `decrypt(ciphertext: string, hexKey: string): string`
- [ ] Algorithm: AES-256-GCM
- [ ] IV: Random 12-byte, generated per encryption
- [ ] Storage format: `base64(iv + authTag + ciphertext)` — single string in one text column
- [ ] Key: 32-byte key, hex-encoded (64 hex chars) from `SHAAM_ENCRYPTION_KEY` env var
- [ ] No key rotation for MVP — documented limitation

### Credentials Repository

- [ ] Repository: `ShaamCredentialsRepository` with methods:
  - `findByBusinessId(businessId): Promise<ShaamCredentials | null>`
  - `upsert(businessId, tokens): Promise<ShaamCredentials>`
  - `markNeedsReauth(businessId): Promise<void>`

### Token Refresh Cron Job

- [ ] Token refresh cron job registered via pg-boss (from T-CRON-01):
  - Schedule: `*/15 * * * *` (every 15 min), `tz: 'Asia/Jerusalem'`
  - Handler: `api/src/jobs/handlers/shaam-token-refresh.ts`
  - Finds credentials where `tokenExpiresAt < NOW() + INTERVAL '5 minutes'`
  - On success: update tokens + expiry
  - On failure: set `needsReauth = true` on credentials row, log error
  - Each business refreshed independently (one failure doesn't block others)

### Trigger Logic (Pure Functions)

- [ ] `requiresAllocationNumber()` in `types/src/shaam.ts` (shared, pure, no side effects):
  ```typescript
  function requiresAllocationNumber(
    invoice: { totalExclVatMinorUnits: number; vatMinorUnits: number },
    customer: { isLicensedDealer: boolean },
    asOfDate?: Date  // defaults to new Date() — pass explicitly in tests
  ): boolean
  ```
- [ ] Logic:
  1. If `vatMinorUnits === 0` → `false` (no VAT = no SHAAM)
  2. If `!customer.isLicensedDealer` → `false` (B2C = no SHAAM)
  3. If `totalExclVatMinorUnits <= currentThreshold(asOfDate) * 100` → `false` (at or below threshold in minor units; must be **strictly above** to require allocation)
  4. Otherwise → `true`
- [ ] `shouldRequestAllocation()` wrapper — for now just delegates to `requiresAllocationNumber()`. The `business.alwaysRequestAllocation` field doesn't exist yet; add a TODO comment noting it will be added with the business settings page.
- [ ] Threshold constants exported from `types/src/shaam.ts`:
  ```typescript
  const ALLOCATION_THRESHOLDS = [
    { from: new Date('2026-06-01'), thresholdILS: 5_000 },
    { from: new Date('2026-01-01'), thresholdILS: 10_000 },
    { from: new Date('2025-01-01'), thresholdILS: 20_000 },
    { from: new Date('2024-01-01'), thresholdILS: 25_000 },
  ];
  ```
  (Sorted newest-first / descending by date; `currentThreshold(date)` returns the first entry where `date >= entry.from`)

### Fastify Plugin

- [ ] Create `api/src/plugins/shaam.ts`:
  - Read `SHAAM_MODE` from env
  - Instantiate the correct client (`ShaamMockClient` or `ShaamHttpClient`)
  - `app.decorate('shaamService', client)`
  - Register in `api/src/app.ts` after auth plugin
- [ ] Add to Fastify type declarations: `declare module 'fastify' { interface FastifyInstance { shaamService: ShaamService } }`

### Credential Population

- [ ] T12 only creates the **data layer** (table + repository + encrypt/decrypt)
- [ ] The OAuth2 consent flow (redirect to ITA, callback endpoint, token exchange) is **deferred to T13** architecture notes
- [ ] For testing: repository `upsert()` method can seed credentials directly

### Tests

- [ ] Unit tests for `requiresAllocationNumber()` in `types/`:
  - Below threshold → false
  - Above threshold, licensed dealer → true
  - Above threshold, NOT licensed dealer → false
  - Zero VAT → false regardless of amount
  - Threshold boundary (exact threshold amount) → false (strictly greater than)
  - Each threshold date boundary (e.g., 2025-12-31 → ₪20k, 2026-01-01 → ₪10k)
- [ ] Unit tests for `encrypt`/`decrypt` round-trip
- [ ] Repository tests for `ShaamCredentialsRepository` (upsert, find, markNeedsReauth)
- [ ] Tests for `ShaamMockClient` basic behavior
- [ ] `api/tests/utils/db.ts` `resetDb()` TRUNCATE list updated to include `business_shaam_credentials`
- [ ] `npm run check` passes

---

## Architecture Notes

### File Layout

```text
api/src/
  jobs/handlers/
    shaam-token-refresh.ts # pg-boss cron handler (every 15 min)
  services/shaam/
    types.ts           # ShaamService interface, AllocationResult type
    mock-client.ts     # ShaamMockClient implementation
    http-client.ts     # ShaamHttpClient (sandbox + production)
  repositories/
    shaam-credentials-repository.ts
  plugins/
    shaam.ts           # Fastify plugin that wires everything up
  lib/
    crypto.ts          # encrypt/decrypt helpers (AES-256-GCM)

types/src/
  shaam.ts             # requiresAllocationNumber(), shouldRequestAllocation(),
                       # threshold constants, shared types
```

### Token Refresh as a Cron Job

Uses the pg-boss infrastructure from T-CRON-01:

```typescript
// Registered during app startup (in shaam plugin or jobs plugin)
await boss.schedule('shaam-token-refresh', '*/15 * * * *', null, { tz: 'Asia/Jerusalem' });
await boss.work('shaam-token-refresh', handleShaamTokenRefresh);
```

The handler iterates over all businesses with expiring tokens. Each refresh is independent — one failure doesn't prevent other businesses from refreshing.

### Mock Behavior

`ShaamMockClient.requestAllocationNumber()` should:
- Return `{ status: 'approved', allocationNumber: 'MOCK-{crypto.randomUUID()}' }` after a 50ms `setTimeout` (simulate network latency)
- Be deterministic in tests: accept an optional `delay` constructor parameter (0 for tests)
- Never throw — always return a successful AllocationResult

### ShaamHttpClient Design

One class, two base URLs:
- `SHAAM_MODE=sandbox` → `https://ita-sandbox.taxes.gov.il/shaam/...` (ITA sandbox)
- `SHAAM_MODE=production` → `https://ita.taxes.gov.il/shaam/...` (ITA production)

The plugin reads `SHAAM_MODE` and passes the corresponding URL. The `ShaamHttpClient` class doesn't know which environment it's in — it just calls whatever base URL it received.

In T12, `ShaamHttpClient.requestAllocationNumber()` is a **stub** that throws `new Error('Not implemented — see T13')`. The real HTTP logic comes in T13. T12 only defines the class shell with the correct constructor signature.

### Encryption Key Management

- The `SHAAM_ENCRYPTION_KEY` env var holds a 64-character hex string (32 bytes decoded)
- No key rotation mechanism for MVP. If the key changes, all stored tokens become unreadable and businesses must re-authorize. This is acceptable for MVP.
- The `crypto.ts` helpers use Node.js `node:crypto` — no external dependencies

### What T13 Expects from T12

T13 (SHAAM Allocation Requests) depends on the following being in place:
1. `ShaamService` interface with `requestAllocationNumber()` signature
2. `ShaamMockClient` fully working (for tests)
3. `ShaamHttpClient` class shell (T13 fills in the HTTP logic)
4. `requiresAllocationNumber()` / `shouldRequestAllocation()` — called after finalization
5. `business_shaam_credentials` table + repository — for token storage
6. Fastify plugin wiring `app.shaamService`
7. `encrypt`/`decrypt` helpers — for reading tokens before API calls
8. pg-boss `shaam-token-refresh` cron job — keeping tokens fresh

---

## Threshold Schedule

| From | Threshold (excl. VAT) | Minor Units |
|------|----------------------|-------------|
| 2024 | > ₪25,000 | > 2,500,000 |
| Jan 2025 | > ₪20,000 | > 2,000,000 |
| Jan 2026 | > ₪10,000 | > 1,000,000 |
| Jun 2026 | > ₪5,000 | > 500,000 |

---

## Out of Scope (Explicitly Deferred)

| Item | Deferred To |
|------|-------------|
| Emergency number methods on interface | T14 |
| OAuth2 consent flow (redirect + callback endpoints) | T13 architecture |
| `business.alwaysRequestAllocation` field | Business settings ticket |
| Email notification on re-auth needed | Post-T11 |
| Encryption key rotation | Post-MVP |
| `shaam_audit_log` table | T13 |
| pg-boss job queue for background allocation | T13 |

---

## Links

- Branch: (to be filled during implementation)
- PR: (to be filled during implementation)
- Deployed: ⬜
