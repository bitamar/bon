# T14 — SHAAM Emergency Numbers & Error Handling

**Status**: 🔒 Blocked (T13 must merge first)
**Phase**: 4 — SHAAM Integration
**Requires**: T13 merged, T-CRON-01 merged (pg-boss for bulk report job)
**Blocks**: nothing directly (T15 payments is independent — see scope note below)

---

## What & Why

SHAAM goes down. When it does, businesses still need to issue invoices. The ITA allows pre-acquired emergency allocation numbers — the business requests a pool of them in advance from ITA directly, then enters them into BON. When SHAAM is unavailable, BON draws from this pool.

This ticket also covers the full error taxonomy and the **recovery reporting job** — when SHAAM comes back online, BON must report which emergency numbers were used and for which invoices.

---

## Emergency Number Consumption

Emergency numbers are consumed atomically via `SELECT ... FOR UPDATE ... LIMIT 1`:

```sql
-- Inside the shaam-allocation-request job handler, when SHAAM returns E099:
BEGIN;
SELECT id, number FROM emergency_allocation_numbers
  WHERE business_id = $1 AND used = false
  ORDER BY acquired_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

UPDATE emergency_allocation_numbers
  SET used = true, used_for_invoice_id = $2, used_at = NOW()
  WHERE id = $selected_id;

UPDATE invoices
  SET allocation_number = $number, allocation_status = 'emergency'
  WHERE id = $2;
COMMIT;
```

`FOR UPDATE SKIP LOCKED` ensures concurrent requests don't deadlock or double-consume the same emergency number.

---

## Recovery Reporting: On-Demand Job via pg-boss

When SHAAM recovers after an outage, BON must batch-report all emergency numbers used during the outage.

```text
SHAAM allocation request succeeds (first success after E099 streak)
     │
     ▼
Enqueue via typed wrapper (fire-and-forget — no withTransactionalJob needed):
  sendJob(boss, 'shaam-emergency-report', { businessId }, {
    singletonKey: businessId,     ← one report job per business at a time
    retryLimit: 3,
    retryDelay: 300,              ← 5 min between retries
    retryBackoff: true,
  })
     │
     ▼
pg-boss worker (registered in api/src/plugins/shaam.ts via runJob wrapper)
  1. SELECT all emergency numbers WHERE used = true AND reported = false
  2. Call ShaamService.reportEmergencyUsage(businessId, usedNumbers)
  3. On success: SET reported = true, reported_at = NOW()
  4. On failure: pg-boss retries
```

Same job pattern as T-ARCH-08 (email) and T13 (allocation). Uses `sendJob()` typed wrapper and `runJob()` error/timing wrapper from T-CRON-01. No `withTransactionalJob` needed — the report enqueue is fire-and-forget after a successful allocation, not atomic with any status transition.

---

## ITA Error Taxonomy

Each ITA error code gets a distinct response:

| ITA Code | Meaning | BON Response | User Message |
|----------|---------|-------------|--------------|
| E001 | Invalid VAT number | Show error on invoice detail | "מספר מע״מ לא תקין — בדוק את פרטי העסק" |
| E002 | Already allocated | Idempotent — store the returned number | (no error shown) |
| E003 | Below threshold | Log warning (shouldn't happen — logic error) | (no error shown) |
| E010 | Auth failure | Mark business needing re-auth, notify owner | "נדרש חיבור מחדש למערכת שע״מ" |
| E099 | System unavailable | Use emergency number | "שע״מ לא זמין — הוקצה מספר חירום" |

Error codes defined as constants in `types/src/shaam.ts`, not magic strings.

---

## Acceptance Criteria

- [ ] `emergency_allocation_numbers` table: businessId, number, used, usedForInvoiceId, usedAt, reported, reportedAt, acquiredAt
- [ ] `EmergencyAllocationRepository` with CRUD + `consumeNext(businessId, invoiceId)` using SELECT FOR UPDATE SKIP LOCKED
- [ ] Settings page section: owner can enter emergency numbers, see pool status (available / used count)
- [ ] Alert shown when pool < 5 numbers remaining (on settings page and as a banner on invoice detail after emergency use)
- [ ] When SHAAM returns E099: consume next emergency number atomically, set `allocationStatus = 'emergency'` on invoice
- [ ] Recovery reporting handler: `api/src/jobs/handlers/shaam-emergency-report.ts`, registered in `api/src/plugins/shaam.ts` via `runJob()` wrapper
- [ ] Recovery report enqueued via `sendJob()` typed wrapper with `singletonKey: businessId`
- [ ] ITA error code constants with Hebrew user-facing messages in `types/src/shaam.ts`
- [ ] All error states visible on invoice detail page with actionable next steps per error code
- [ ] T14 extends the `ShaamService` interface with `reportEmergencyUsage()` — T12 defers emergency methods to T14
- [ ] `npm run check` passes

### Already done (do not re-implement)

- `allocationStatus` enum already includes `'emergency'` value (`types/src/invoices.ts:35`).
- `allocationNumber` and `allocationError` columns exist on `invoices` table (`api/src/db/schema.ts:235-237`).
- Invoice serializer already includes `allocationStatus`, `allocationNumber`, `allocationError` (`api/src/lib/invoice-serializers.ts:33-35`).
- Basic `rejected` → store error + show banner is done in T13 (generic message). T14 replaces generic with per-code messages.
- pg-boss infrastructure from T-CRON-01: `app.boss` decorator, `sendJob()` typed wrapper, `runJob()` error/timing wrapper, `JobPayloads` registry (already includes `'shaam-emergency-report': { businessId: string }`).
- `shaam_audit_log` table from T13.
- `ShaamCredentialsRepository.markNeedsReauth(businessId)` from T12 (for E010 handling).

---

## Architecture Notes

### Dependencies from other tickets

| Dependency | Provided by | What T14 consumes |
|---|---|---|
| `ShaamService` interface + `ShaamHttpClient` / `ShaamMockClient` | T12 | T14 **extends** the interface to add `reportEmergencyUsage()` |
| `shouldRequestAllocation()` pure function | T12 | Already called by T13 job — T14 doesn't call it directly |
| `shaam-allocation-request` job handler | T13 | T14 **modifies** this handler to add E099 → emergency fallback |
| `shaam_audit_log` table | T13 | Emergency usage logged here too |
| pg-boss instance + `app.boss` + `sendJob` + `runJob` wrappers | T-CRON-01 | `sendJob(boss, 'shaam-emergency-report', ...)`, `runJob()` for handler registration |
| `needsReauth` flag on credentials | T12 | T14's E010 handler sets this flag |

### Modifying the T13 job handler

T13's `shaam-allocation-request` handler currently handles:
- `approved` → store number
- `rejected` → store error (generic)
- `deferred` → throw to retry

T14 modifies the same handler to:
- `rejected` → look up `ITA_ERROR_MAP[errorCode]`, store per-code Hebrew message; if E010, set `needsReauth = true`
- `emergency` (E099) → consume from pool via `EmergencyAllocationRepository.consumeNext()`; if pool empty, store error with "מאגר מספרי חירום ריק" message
- On first `approved` after an E099 streak → enqueue `shaam-emergency-report` job for recovery reporting

### API routes

```http
POST   /businesses/:businessId/emergency-numbers       — add numbers to pool (owner only)
GET    /businesses/:businessId/emergency-numbers        — list pool (available + used)
DELETE /businesses/:businessId/emergency-numbers/:id    — remove unused number from pool
```

### UI: emergency number management (settings page section)

- Shown only to business owners
- Input: textarea where owner pastes numbers (one per line), parsed and validated on submit
- Pool status: "X מספרים זמינים, Y נוצלו" with progress bar
- Alert banner: appears when available count < 5 — "מאגר מספרי החירום עומד להסתיים — יש להזין מספרים חדשים"
- Table: number, status (available/used/reported), usedAt, reportedAt, invoice link (if used)

### Invoice detail page — error state display

Each error code maps to a distinct banner on the invoice detail page:

| Error code | Banner color | Message | Action button |
|---|---|---|---|
| E001 | Red | "מספר מע״מ לא תקין — בדוק את פרטי העסק" | "עבור להגדרות" |
| E002 | Blue (info) | "חשבונית כבר קיבלה מספר הקצאה" | (none — auto-resolved) |
| E010 | Orange | "נדרש חיבור מחדש למערכת שע"מ" | "חבר מחדש" |
| E099 + emergency used | Yellow | "שע"מ לא זמין — הוקצה מספר חירום XXXXX" | (none — auto-resolved) |
| E099 + pool empty | Red | "שע"מ לא זמין ומאגר מספרי החירום ריק" | "הזן מספרי חירום" |

---

## Scope boundary with T13 and T15

**T13 → T14 handoff:**
- T13 handles `approved`, `rejected` (generic message), `deferred` (retry).
- T14 replaces generic rejection with per-code Hebrew messages and adds E099 → emergency fallback.
- T14 **modifies** T13's job handler — not a separate handler.

**T14 does NOT block T15 (payments):**
- T15 is payment recording (mark as paid, partial payments). It operates on finalized invoices regardless of whether they have allocation numbers.
- Payments don't depend on emergency numbers or error handling. T15 depends on build order (Phase 4 complete), not T14 specifically.

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
