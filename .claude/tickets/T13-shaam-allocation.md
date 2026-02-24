# T13 — SHAAM Allocation Requests

**Status**: 🔒 Blocked (T12 must merge first)
**Phase**: 4 — SHAAM Integration
**Requires**: T12 merged
**Blocks**: T14

---

## What & Why

The actual call to ITA's API to get an allocation number. This runs in the background after finalization — it must not block the invoice from being created. The invoice is legally created the moment it's finalized; the allocation number is an additional compliance step.

---

## Acceptance Criteria

- [ ] Fix TOCTOU race in `invoice-service.ts finalize()`: move customer/invoice validation inside the transaction with `SELECT ... FOR UPDATE` (see TODO comment in code)
- [ ] After finalization, `shouldRequestAllocation()` is evaluated
- [ ] If true: enqueue a background job (pg-boss) to request allocation number
- [ ] Job calls `ShaamService.requestAllocationNumber()` with full invoice + line items
- [ ] ITA payload maps all ~26 required fields per spec (Table 2.1 + 2.2)
- [ ] Full request + response JSON stored in `shaam_audit_log` table
- [ ] On `approved`: store `allocationNumber` on invoice, `allocationStatus = approved`
- [ ] On `rejected`: store error code, `allocationStatus = rejected`, show banner on invoice detail
- [ ] On `deferred`: retry with exponential backoff
- [ ] Sandbox integration tested end-to-end with ITA sandbox credentials
- [ ] `allocationNumber` shown prominently on invoice detail and PDF
- [ ] `npm run check` passes

---

## Architecture Notes

<!-- Your notes here — e.g. job queue design (pg-boss config), retry strategy, how the ITA field mapping is structured, audit log schema -->

---

## ITA API Notes

- Document type code: 305 = חשבונית מס, 320 = חשבונית מס קבלה, 400 = קבלה, 330 = חשבונית זיכוי
- Amounts sent in the major currency unit (decimal), not minor units
- `ClientVatNumber` required only if `isLicensedDealer`

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
