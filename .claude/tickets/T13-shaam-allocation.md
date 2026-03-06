# T13 — SHAAM Allocation Requests

**Status**: 🔒 Blocked (T12 must merge first)
**Phase**: 4 — SHAAM Integration
**Requires**: T12 merged (SHAAM abstraction + pg-boss from T-CRON-01)
**Blocks**: T14

---

## What & Why

The actual call to ITA's API to get an allocation number. This runs as a **background job** after finalization — it must not block the invoice from being created. The invoice is legally created the moment it's finalized; the allocation number is an additional compliance step.

Uses the same on-demand job pattern proven by T-ARCH-08 (async email delivery).

---

## Flow: Outbox Pattern via pg-boss

```text
Invoice finalized
     │
     ▼
finalize() in invoice-service.ts
  1. Inside the finalization transaction:
  2. If shouldRequestAllocation(invoice, customer, business):
     a. SET allocationStatus = 'pending'
     b. boss.send('shaam-allocation-request', {
          invoiceId, businessId
        }, {
          singletonKey: invoiceId,    ← one job per invoice
          retryLimit: 5,
          retryDelay: 60,             ← seconds
          retryBackoff: true,         ← exponential: 60s, 120s, 240s, 480s, 960s
          expireInMinutes: 30,
        })
  3. COMMIT
  4. Return finalized invoice to client (allocationStatus: 'pending')
     │
     ▼
pg-boss worker (async, background)
  1. Pick up job
  2. Acquire valid SHAAM token for business (refresh if needed)
  3. Map invoice + line items to ITA payload (~26 fields)
  4. Call ShaamService.requestAllocationNumber()
  5. Store full request + response JSON in shaam_audit_log
  6. On 'approved':
     - SET allocationNumber, allocationStatus = 'approved'
  7. On 'rejected':
     - SET allocationError, allocationStatus = 'rejected'
     - (Future: notify business owner)
  8. On 'deferred' / transient error:
     - pg-boss retries automatically
  9. On E099 (SHAAM unavailable):
     - Use emergency number (T14)
     - SET allocationStatus = 'emergency'
```

### Why This is the Same Pattern as T-ARCH-08

| Aspect | T-ARCH-08 (email) | T13 (SHAAM) |
|--------|-------------------|-------------|
| Trigger | User clicks "Send" | Invoice finalized + threshold met |
| Transitional status | `'sending'` | `allocationStatus: 'pending'` |
| Job name | `send-invoice-email` | `shaam-allocation-request` |
| singletonKey | `invoiceId` | `invoiceId` |
| External call | Resend API | ITA SHAAM API |
| Success status | `'sent'` | `allocationStatus: 'approved'` |
| Exhaustion behavior | Revert to `'finalized'` | Keep `allocationStatus: 'pending'`, alert |

---

## Acceptance Criteria

- [ ] Verify `finalize()` retains the existing lock-in-transaction pattern (`findInvoiceByIdForUpdate`) when adding the allocation enqueue step — allocation enqueue must happen inside the same transaction that locks the invoice row
- [ ] After finalization, `shouldRequestAllocation()` (from T12) is evaluated inside the transaction
- [ ] If true: enqueue `shaam-allocation-request` job via pg-boss (inside transaction)
- [ ] `singletonKey: invoiceId` prevents duplicate allocation requests
- [ ] Job handler registered at `api/src/jobs/handlers/shaam-allocation.ts`
- [ ] Job calls `ShaamService.requestAllocationNumber()` (from T12) with full invoice + line items
- [ ] ITA payload maps all ~26 required fields per spec (Table 2.1 + 2.2) — see field mapping below
- [ ] `shaam_audit_log` table created (schema below) — stores full request + response JSON
- [ ] On `approved`: store `allocationNumber` on invoice, set `allocationStatus = 'approved'`
- [ ] On `rejected`: store error code, set `allocationStatus = 'rejected'`, show status banner on invoice detail
- [ ] On `deferred`: retry with exponential backoff (pg-boss retryLimit + retryBackoff)
- [ ] `allocationNumber` shown prominently on invoice detail page and PDF template
- [ ] Integration tested end-to-end with `ShaamMockClient` (from T12); real ITA sandbox if credentials available
- [ ] `npm run check` passes

### Already done (do not re-implement)

- ~~Fix TOCTOU race in `invoice-service.ts finalize()`~~ — **Done in T-ARCH-02** (merged). Uses `SELECT ... FOR UPDATE` inside the finalization transaction.
- `allocationNumber` and `allocationStatus` columns already exist on the `invoices` table in `api/src/db/schema.ts` (lines 235-236).
- Invoice serializer already includes both fields (`api/src/lib/invoice-serializers.ts`).

---

## Schema & Dependencies

### Dependencies from other tickets

| Dependency | Provided by | What T13 consumes |
|---|---|---|
| `ShaamService` interface + 2 implementations | T12 | `requestAllocationNumber(request)` |
| `shouldRequestAllocation()` pure function | T12 | Evaluates threshold + isLicensedDealer + VAT |
| `SHAAM_MODE` env var toggle | T12 | mock / sandbox / production |
| pg-boss instance + `app.boss` decorator | T-CRON-01 | `boss.send('shaam-allocation-request', payload)` |

### `shaam_audit_log` table

```text
shaam_audit_log:
  id              uuid PK default gen_random_uuid()
  businessId      uuid FK → businesses NOT NULL
  invoiceId       uuid FK → invoices NOT NULL
  requestPayload  jsonb NOT NULL          — full ITA request body
  responsePayload jsonb                   — full ITA response (null if network error)
  httpStatus      integer                 — HTTP status code
  allocationNumber text                   — returned number (if approved)
  errorCode       text                   — ITA error code (if rejected)
  result          text NOT NULL           — 'approved' | 'rejected' | 'deferred' | 'error'
  attemptNumber   integer NOT NULL default 1
  createdAt       timestamptz NOT NULL default now()
```

Index: `(invoiceId)` for lookups from invoice detail page.

### Job design

```typescript
// Enqueue after finalization (in invoice-service.ts, inside the finalization transaction)
if (shouldRequestAllocation(invoice, customer, business)) {
  await app.boss.send('shaam-allocation-request', {
    businessId: invoice.businessId,
    invoiceId: invoice.id,
  }, {
    singletonKey: invoice.id,  // prevents duplicate jobs for same invoice
    retryLimit: 5,
    retryDelay: 60,      // 60 seconds initial
    retryBackoff: true,   // exponential backoff
    expireInMinutes: 30,  // give up after 30 minutes
  });
}

// Handler: api/src/jobs/handlers/shaam-allocation.ts
async function handleShaamAllocation(job: PgBoss.Job<ShaamAllocationPayload>) {
  const { businessId, invoiceId } = job.data;
  // 1. Load invoice + line items + customer from DB
  // 2. Build ITA payload (field mapping below)
  // 3. Call ShaamService.requestAllocationNumber()
  // 4. Log to shaam_audit_log (request + response)
  // 5. Update invoice allocationStatus + allocationNumber
  // 6. If deferred: throw to trigger pg-boss retry
}
```

### ITA field mapping (Table 2.1 — invoice header)

Key fields that need mapping from our data model:

| ITA Field | Source |
|---|---|
| `InvoiceType` | documentType → ITA code (305/320/400/330) |
| `InvoiceNumber` | invoice.invoiceNumber |
| `InvoiceDate` | invoice.issuedAt (formatted) |
| `DealerVatNumber` | business.vatNumber |
| `ClientName` | invoice.customerName (snapshot) |
| `ClientVatNumber` | invoice.customerTaxId (only if isLicensedDealer) |
| `DealAmount` | invoice.totalExclVatMinorUnits / 100 |
| `VatAmount` | invoice.vatMinorUnits / 100 |
| `TotalAmount` | invoice.totalInclVatMinorUnits / 100 |

Table 2.2 (line items) maps `description`, `quantity`, `unitPrice`, `lineTotal` — all amounts divided by 100 to convert from minor to major units.

Full field list (~26 fields) must be derived from the ITA SHAAM API specification. Define a `buildItaPayload()` pure function in `api/src/services/shaam/` for testability.

---

## ITA API Notes

- Document type code: 305 = חשבונית מס, 320 = חשבונית מס קבלה, 400 = קבלה, 330 = חשבונית זיכוי
- Amounts sent in the major currency unit (decimal), not minor units
- `ClientVatNumber` required only if `isLicensedDealer`
- The `buildItaPayload()` function must be unit-testable with fixture data

---

## Scope boundary with T14

T13 handles the **happy path** and basic retry logic:
- `approved` → store number
- `rejected` → store error, show banner (generic message)
- `deferred` → retry via pg-boss

T14 adds:
- Emergency number fallback when SHAAM is unavailable (E099)
- Full error taxonomy with per-code Hebrew messages
- Emergency number pool management UI
- Bulk reporting of emergency usage

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
