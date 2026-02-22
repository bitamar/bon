# T08 — Invoice Finalization UX & Detail View

**Status**: 🔒 Blocked (T07 must merge first)
**Phase**: 2 — Invoices
**Requires**: T07 merged
**Blocks**: T09, T10

---

## What & Why

Finalization is the legal act. The invoice becomes immutable, gets its sequential number, and the customer data is snapshotted. After this point no field can be changed — only a credit note can correct it.

The detail view is what the business owner sees after finalizing. It should feel like a "done" state — clean, read-only, with clear next steps (download, send, mark paid).

**Scope boundary with T07**: T07 builds the finalize **API endpoint** (`POST /invoices/:id/finalize` — route, service logic, repository, tests). T08 builds the **frontend finalization flow** (business profile completeness gate, preview modal, confirmation UX, `vatExemptionReason` prompt) and the **invoice detail view page**. T08 does NOT re-implement the backend — it builds the frontend on top of T07's API.

---

## Acceptance Criteria

### Finalization Flow (frontend)
- [ ] "הפק חשבונית" button replaces T07's basic finalize button with the full flow
- [ ] **Business profile completeness gate** (before any other validation):
  - [ ] Required fields: name, registrationNumber, streetAddress, city, and vatNumber (non-exempt only)
  - [ ] If any are missing, show a modal with only the missing fields (not full settings page)
  - [ ] User fills inline → saves to business → finalization continues
  - [ ] Drafts are never gated — only finalization
- [ ] **`vatExemptionReason` prompt**: when invoice VAT calculates to 0 and business is non-exempt, show a Select field before finalizing with exemption reason options (e.g., "ייצוא שירותים §30(א)(5)", "עסקה עם גוף מדינה", "אחר — פרט בהערות")
- [ ] Client-side validation before API call: customer required, ≥1 line item
- [ ] Preview modal: invoice as it will appear (read-only) before confirming
- [ ] Confirm → `POST /businesses/:id/invoices/:id/finalize`
  - [ ] Server recalculates all amounts (ignores client values)
  - [ ] Sequential number assigned in same transaction (race-safe)
  - [ ] Customer data snapshot stored
  - [ ] `issuedAt` set server-side
- [ ] Redirect to invoice detail page after finalization
- [ ] Error: sequence number conflict → show retry option

### Detail View
- [ ] Invoice detail page (`/business/invoices/:id`):
  - [ ] All fields displayed as they'll appear on the PDF
  - [ ] Status banner: draft / finalized / sent / paid
  - [ ] Action buttons: "הורד PDF" (placeholder), "שלח במייל" (placeholder), "סמן כשולם" (placeholder)
  - [ ] Finalized invoices are read-only — no edit affordances
  - [ ] Drafts redirect to edit page

### General
- [ ] `npm run check` passes

---

## Architecture Notes

**Finalization transaction** (already built in T07 backend — this section documents the server behavior for frontend reference):
1. Validate: must be draft, has customer (active), has ≥1 line item
2. Lock + assign sequence number via `assignInvoiceNumber()` (SELECT FOR UPDATE)
3. Snapshot customer: `customerName`, `customerTaxId`, `customerAddress`, `customerEmail` from current customer record
4. Recalculate all amounts server-side (discard client values)
5. Set `issuedAt = now()`, `status = 'finalized'`

**Sequence groups** (from T06): `tax_invoice` and `tax_invoice_receipt` share `tax_document` group. `credit_note` and `receipt` each have their own group. Lazy seeding on first finalization.

**Status machine** (defined in T06, enforced in T07 backend):
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
