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

## API Contract

**Endpoint**: `POST /businesses/:businessId/invoices/:invoiceId/credit-note` → `201 Created`

**Request body** (`createCreditNoteBodySchema` in `types/src/invoices.ts`):

```ts
export const createCreditNoteBodySchema = z.object({
  items: z.array(lineItemInputSchema).min(1),
  invoiceDate: dateString.optional(),       // defaults to today
  notes: z.string().trim().max(2000).optional(),
}).strict();
```

**Partial credit approach**: Line-item adjustment only — no flat amount override. The modal pre-fills with the original invoice's line items. The user removes lines or reduces quantities/prices to create a partial credit. This keeps credit notes auditable at the line-item level (accountants can verify exactly what was credited).

**Response**: The created credit note invoice object (same shape as `invoiceSchema`).

---

## Acceptance Criteria

- [ ] "הפק חשבונית זיכוי" button on finalized/sent/paid/partially_paid invoice detail
- [ ] Modal pre-fills line items from original invoice; user can remove lines or adjust quantities/prices
- [ ] Full credit = submit all lines unchanged; partial credit = adjust before submitting
- [ ] Credit note created as new invoice record: `documentType = credit_note`, `creditedInvoiceId` set
- [ ] Original invoice status → `credited`
- [ ] Credit note gets its own sequential number from the `credit_note` sequence group
- [ ] If credit note amount exceeds threshold: SHAAM allocation requested (same flow as T13)
- [ ] Credit note visible in invoice list with distinct visual treatment
- [ ] Credit note detail page shows "חשבונית זיכוי עבור חשבונית מס מספר {number}" with link to original
- [ ] Original invoice detail page shows "זוכתה בחשבונית זיכוי מספר {number}" with link to credit note
- [ ] Service rejects credit note where `creditedInvoiceId` equals the credit note's own ID (self-reference guard)
- [ ] Service rejects credit note for invoices in `draft`, `cancelled`, or `credited` status
- [ ] `npm run check` passes

---

## Architecture Notes

**Sign convention** (decided in T06): Credit note line items store **positive amounts**. The sign is applied at the document level (display/reporting), not in the data. `calculateLine()` from `@bon/types/vat` works identically for credit notes and invoices. The "this is a credit" semantics live on `documentType = credit_note`.

**Eligible source invoices**: finalized, sent, partially_paid, or paid. Cancelled and credited invoices cannot be credited again.

**`creditedInvoiceId` constraint**: Must reference an invoice in the same `businessId`. Enforced in service layer (not DB FK — a composite FK would require an extra unique constraint).

**Self-reference guard**: `creditedInvoiceId !== invoiceId` — a credit note cannot credit itself. Enforced in service layer.

**Back-link display**: Both the credit note and the original invoice show a cross-link in their detail pages. The API response should include `creditedInvoiceDocumentNumber` (the original's formatted number) on credit note records to avoid an extra fetch. On the original invoice, fetch credit notes via `creditedInvoiceId` reference.

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
