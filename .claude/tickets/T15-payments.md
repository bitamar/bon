# T15 — Payment Recording

**Status**: 🔒 Blocked (T14 must merge first)
**Phase**: 5 — Invoice Lifecycle
**Requires**: T14 merged
**Blocks**: T16

---

## What & Why

An invoice isn't done until it's paid. Payment recording closes the loop and lets the business track cash flow. Partial payments matter — a common scenario in Israeli B2B is paying 50% upfront and 50% on delivery.

---

## Acceptance Criteria

- [ ] `invoice_payments` table: invoiceId, amountAgora, paidAt, method, reference, notes, recordedByUserId
- [ ] `POST /businesses/:id/invoices/:id/payments` — record a payment
- [ ] Payment methods: מזומן, העברה בנקאית, אשראי, שיק, אחר
- [ ] Partial payment: status → `partially_paid`, remaining balance shown
- [ ] Full payment (cumulative): status → `paid`, `paidAt` set
- [ ] "סמן כשולם" button on invoice detail:
  - [ ] Modal: amount (NumberInput ₪), date (DatePickerInput), method (Select), reference (TextInput), notes (Textarea)
  - [ ] Amount defaults to remaining balance
  - [ ] Validates: amount ≤ remaining balance
- [ ] Payment history shown on invoice detail (chronological list)
- [ ] `npm run check` passes

---

## Architecture Notes

<!-- Your notes here — e.g. how remaining balance is calculated (sum of payments vs invoice total), whether overpayment is allowed, status transition rules -->

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
