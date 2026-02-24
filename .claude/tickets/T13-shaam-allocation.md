# T13 — SHAAM Allocation Requests

**Status**: 📝 Needs spec work (Architect pass required)
**Phase**: 4 — SHAAM Integration
**Requires**: T12 merged
**Blocks**: T14

---

## What & Why

The actual call to ITA's API to get an allocation number. This runs in the background after finalization — it must not block the invoice from being created. The invoice is legally created the moment it's finalized; the allocation number is an additional compliance step.

---

## Prerequisite: Extract TOCTOU Fix to Separate Ticket

The previous version of this ticket included "Fix TOCTOU race in `invoice-service.ts finalize()`." This is a **bug fix to existing code** and should not be bundled with new feature work. Create a separate small ticket (T-BUG-01 or similar) that:
- Moves customer/invoice validation inside the finalization transaction
- Adds `SELECT ... FOR UPDATE` on the invoice row
- Can be merged independently, ideally before T13

---

## Recommended PR Split

- **PR 1 — Backend allocation flow**: `ShaamSandboxClient` + `ShaamApiClient` HTTP implementation, ITA field mapping, `shaam_audit_log` table + migration, post-finalization trigger logic, background job enqueue (pg-boss), allocation result handler
- **PR 2 — Frontend allocation status**: Allocation status banner on invoice detail page, polling/refetch for pending status, retry button for rejected

---

## Acceptance Criteria

### Background Job Flow

- [ ] After finalization in `invoice-service.ts`, evaluate `shouldRequestAllocation()`
- [ ] If true: enqueue a pg-boss job `shaam-allocation-request` with payload `{ businessId, invoiceId }`
- [ ] pg-boss dependency: if T-CRON-01 has not shipped yet, use a simple `setTimeout` fallback with a TODO comment. Do NOT block T13 on T-CRON-01.
- [ ] Job handler:
  1. Load invoice + items + business + SHAAM credentials
  2. If credentials missing or `needsReauth`: set `allocationStatus = 'deferred'`, log, exit
  3. Call `ShaamService.requestAllocationNumber()`
  4. Store result on invoice: `allocationNumber`, `allocationStatus`, `allocationError`
  5. Log full request + response to `shaam_audit_log`

### ITA API Field Mapping

- [ ] Map invoice data to ITA's Table 2.1 fields:
  ```typescript
  const payload = {
    AccountingDocType: documentTypeToItaCode(invoice.documentType),  // 305, 320, 330, 400
    AccountingSoftwareNumber: config.SHAAM_REGISTRATION_NUMBER ?? '',
    VatNumber: business.vatNumber,
    DocumentNumber: invoice.documentNumber,
    DocumentDate: invoice.invoiceDate,                  // YYYY-MM-DD
    DealAmount: invoice.totalExclVatMinorUnits / 100,   // major currency units
    VatAmount: invoice.vatMinorUnits / 100,
    TotalAmount: invoice.totalInclVatMinorUnits / 100,
    ClientVatNumber: invoice.customerTaxId ?? '',        // required if isLicensedDealer
    ClientName: invoice.customerName,
    // ... remaining fields per ITA spec (obtain from ITA developer portal)
  };
  ```
- [ ] Map line items to Table 2.2:
  ```typescript
  lineItems.map((item, i) => ({
    LineNumber: i + 1,
    Description: item.description,
    CatalogNumber: item.catalogNumber ?? '',
    Quantity: Number(item.quantity),
    UnitPrice: item.unitPriceMinorUnits / 100,
    LineTotal: item.lineTotalMinorUnits / 100,
    VatRate: item.vatRateBasisPoints / 100,             // e.g. 17 (not 1700)
    VatAmount: item.vatAmountMinorUnits / 100,
  }))
  ```
- [ ] **Note**: The exact field list (~26 fields) must be obtained from the ITA developer portal or SHAAM API documentation. The mapping above covers the known fields; the Implementer must fill in the rest from the official spec.

### Audit Log

- [ ] Migration creates `shaam_audit_log` table:
  ```
  id                uuid PK
  businessId        uuid FK → businesses NOT NULL
  invoiceId         uuid FK → invoices NOT NULL
  requestPayload    jsonb NOT NULL          — full request body sent to ITA
  responsePayload   jsonb                   — full response from ITA (null if network error)
  httpStatus        integer                 — HTTP status code (null if network error)
  allocationResult  text                    — 'approved' | 'rejected' | 'deferred' | 'error'
  errorCode         text                    — ITA error code if rejected
  errorMessage      text                    — ITA error message
  durationMs        integer                 — request duration in milliseconds
  createdAt         timestamp with tz NOT NULL DEFAULT now()
  ```
- [ ] Every SHAAM API call (success or failure) creates an audit log entry
- [ ] Audit log is append-only — no updates, no deletes (compliance requirement)

### Result Handling

- [ ] On `approved`: store `allocationNumber`, set `allocationStatus = 'approved'`
- [ ] On `rejected`: store `allocationError` (ITA error message), set `allocationStatus = 'rejected'`
- [ ] On network error / timeout: set `allocationStatus = 'deferred'`, retry with exponential backoff (pg-boss retry: 3 attempts, delays 30s, 2min, 10min)
- [ ] On auth failure (E010): set `needsReauth = true` on credentials, set `allocationStatus = 'deferred'`

### Frontend: Allocation Status Display

- [ ] On invoice detail page, show allocation status:
  - `pending`: "ממתין למספר הקצאה..." with spinner. Auto-refetch every 5 seconds (max 60 seconds, then stop and show "נסו לרענן").
  - `approved`: prominent green box "מספר הקצאה: {number}"
  - `rejected`: red banner with error message + "נסה שנית" retry button
  - `null` (not applicable): nothing shown
- [ ] Retry button calls a new endpoint `POST .../retry-allocation` that re-enqueues the job

### Sandbox Testing

- [ ] `ShaamSandboxClient` calls ITA's sandbox URL (different base URL, same API shape)
- [ ] Sandbox credentials managed via env vars: `SHAAM_SANDBOX_URL`, `SHAAM_SANDBOX_CLIENT_ID`, `SHAAM_SANDBOX_CLIENT_SECRET`
- [ ] End-to-end sandbox test documented in ticket (manual, not CI — requires ITA sandbox access)

### General

- [ ] `npm run check` passes
- [ ] Tests: job handler with mock ShaamService, audit log creation, result handling (approved/rejected/deferred), field mapping unit test

---

## ITA API Notes

- Document type codes: 305 = חשבונית מס, 320 = חשבונית מס קבלה, 400 = קבלה, 330 = חשבונית זיכוי
- Amounts sent in major currency units (decimal with 2 places), not minor units
- `ClientVatNumber` required only if `isLicensedDealer`
- ITA sandbox access must be applied for via the developer portal — this may take days/weeks

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
