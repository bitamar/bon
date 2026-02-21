# T08 — Invoice Finalization & Detail View

**Status**: 🔒 Blocked (T07 must merge first)
**Phase**: 2 — Invoices
**Requires**: T07 merged
**Blocks**: T09, T10

---

## What & Why

Finalization is the legal act. The invoice becomes immutable, gets its sequential number, and the customer data is snapshotted. After this point no field can be changed — only a credit note can correct it.

The detail view is what the business owner sees after finalizing. It should feel like a "done" state — clean, read-only, with clear next steps (download, send, mark paid).

---

## Acceptance Criteria

- [ ] "הפק חשבונית" button triggers finalization flow
- [ ] **Business profile completeness gate** (before any other validation):
  - [ ] Required fields: name, registrationNumber, streetAddress, city, and vatNumber (non-exempt only)
  - [ ] If any are missing, show a modal with only the missing fields (not full settings page)
  - [ ] User fills inline → saves to business → finalization continues
  - [ ] Drafts are never gated — only finalization
- [ ] Client-side validation before API call: customer required, ≥1 line item, all amounts > 0
- [ ] Preview modal: invoice as it will appear (read-only) before confirming
- [ ] Confirm → `POST /businesses/:id/invoices/:id/finalize`
  - [ ] Server recalculates all amounts (ignores client values)
  - [ ] Sequential number assigned in same transaction (race-safe)
  - [ ] Customer data snapshot stored
  - [ ] `issuedAt` set server-side
- [ ] Redirect to invoice detail page after finalization
- [ ] Invoice detail page (`/business/invoices/:id`):
  - [ ] All fields displayed as they'll appear on the PDF
  - [ ] Status banner: draft / finalized / sent / paid
  - [ ] Action buttons: "הורד PDF" (placeholder), "שלח במייל" (placeholder), "סמן כשולם" (placeholder)
  - [ ] Finalized invoices are read-only — no edit affordances
- [ ] Error: sequence number conflict → show retry option
- [ ] `npm run check` passes

---

## Architecture Notes

**Finalization transaction** (single transaction, all-or-nothing):
1. Validate: must be draft, has customer, has ≥1 line item
2. Lock + assign sequence number via `assignInvoiceNumber()` (SELECT FOR UPDATE)
3. Snapshot customer: `customerName`, `customerTaxId`, `customerAddress`, `customerEmail` from current customer record
4. Recalculate all amounts server-side (discard client values)
5. Set `issuedAt = now()`, `status = 'finalized'`

**Sequence groups** (from T06): `tax_invoice` and `tax_invoice_receipt` share `tax_document` group. `credit_note` and `receipt` each have their own group. Lazy seeding on first finalization.

**Status machine** (defined in T06, enforced here):
- `paid → credited` is allowed (refunds via credit note — legally required)
- `paid → cancelled` is forbidden (must issue credit note instead)
- Status transition validation should be a utility function reusable by T15/T16

**Customer snapshot includes `customerEmail`** — needed for T11 email delivery records.

**VAT rate validation on finalize**: exempt_dealer → all rates must be 0. Non-exempt → rates must be 0 or 1700.

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
