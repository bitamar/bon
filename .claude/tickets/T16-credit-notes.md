# T16 — Credit Notes (חשבונית מס זיכוי)

**Status**: 🔒 Blocked (T15 must deploy first)
**Phase**: 5 — Invoice Lifecycle
**Requires**: T15 deployed
**Blocks**: T17

---

## What & Why

A credit note is a legal document (type 330) that cancels or partially reverses a finalized invoice. It gets its own sequential number in the 330 sequence. It must reference the original invoice. It may also require a SHAAM allocation number if above threshold.

---

## Acceptance Criteria

- [ ] "הפק חשבונית זיכוי" button on finalized invoice detail
- [ ] Modal: choose full credit or partial (adjust line items or total amount)
- [ ] Credit note created as new invoice record: `documentType = credit_note`, `creditedInvoiceId` set
- [ ] Original invoice status → `credited`
- [ ] Credit note gets its own sequential number from the 330 sequence
- [ ] If credit note amount exceeds threshold: SHAAM allocation requested (same flow as T13)
- [ ] Credit note visible in invoice list with distinct visual treatment
- [ ] Credit note detail page links back to original invoice
- [ ] `npm run check` passes

---

## Architecture Notes

<!-- Your notes here — e.g. whether credit notes share the same invoice UI or have a dedicated form, how partial credit works (line-level vs total-level), how VAT is reversed -->

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
