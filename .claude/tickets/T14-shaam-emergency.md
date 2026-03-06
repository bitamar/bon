# T14 — SHAAM Emergency Numbers & Error Handling

**Status**: 🔒 Blocked (T13 must merge first)
**Phase**: 4 — SHAAM Integration
**Requires**: T13 merged
**Blocks**: T15

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

```
SHAAM allocation request succeeds (first success after E099 streak)
     │
     ▼
Enqueue 'shaam-emergency-report' job
  boss.send('shaam-emergency-report', { businessId }, {
    singletonKey: businessId,     ← one report job per business at a time
    retryLimit: 3,
    retryDelay: 300,              ← 5 min between retries
    retryBackoff: true,
  })
     │
     ▼
pg-boss worker
  1. SELECT all emergency numbers WHERE used = true AND reported = false
  2. Call ShaamService.reportEmergencyUsage(businessId, usedNumbers)
  3. On success: SET reported = true, reported_at = NOW()
  4. On failure: pg-boss retries
```

Same outbox pattern as T-ARCH-08 (email) and T13 (allocation).

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

- [ ] `emergency_allocation_numbers` table: businessId, number, used, usedForInvoiceId, usedAt, reported, reportedAt
- [ ] Settings page section: owner can enter emergency numbers, see pool status
- [ ] Alert shown when pool < 5 numbers remaining
- [ ] When SHAAM returns E099: consume next emergency number atomically (SELECT FOR UPDATE SKIP LOCKED)
- [ ] Recovery reporting job: `api/src/jobs/handlers/shaam-emergency-report.ts`
- [ ] `singletonKey: businessId` prevents duplicate report jobs per business
- [ ] ITA error code constants with Hebrew user-facing messages in `types/src/shaam.ts`
- [ ] All error states visible on invoice detail page with actionable next steps
- [ ] `npm run check` passes

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
