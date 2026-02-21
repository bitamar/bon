# T16 — Credit Notes (חשבונית מס זיכוי)

**Status**: 🔒 Blocked (T15 must merge first)
**Phase**: 5 — Invoice Lifecycle
**Requires**: T15 merged
**Blocks**: T17

---

## What & Why

A credit note is a legal document (type 330) that cancels or partially reverses an invoice. It gets its own sequential number in the `credit_note` sequence group. It must reference the original invoice. It may also require a SHAAM allocation number if above threshold.

**Paid invoices CAN be credited** — this is how refunds work. The status machine allows `paid → credited`.

---

## Acceptance Criteria

- [ ] "הפק חשבונית זיכוי" button on finalized/sent/paid invoice detail
- [ ] Modal: choose full credit or partial (adjust line items or total amount)
- [ ] Credit note created as new invoice record: `documentType = credit_note`, `creditedInvoiceId` set
- [ ] Original invoice status → `credited`
- [ ] Credit note gets its own sequential number from the `credit_note` sequence group
- [ ] If credit note amount exceeds threshold: SHAAM allocation requested (same flow as T13)
- [ ] Credit note visible in invoice list with distinct visual treatment
- [ ] Credit note detail page links back to original invoice
- [ ] `npm run check` passes

---

## Architecture Notes

**Sign convention** (decided in T06): Credit note line items store **positive amounts**. The sign is applied at the document level (display/reporting), not in the data. `calculateLine()` from `@bon/types/vat` works identically for credit notes and invoices. The "this is a credit" semantics live on `documentType = credit_note`.

**Eligible source invoices**: finalized, sent, partially_paid, or paid. Cancelled and credited invoices cannot be credited again.

**`creditedInvoiceId` constraint**: Must reference an invoice in the same `businessId`. Enforced in service layer (not DB FK — a composite FK would require an extra unique constraint).

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
