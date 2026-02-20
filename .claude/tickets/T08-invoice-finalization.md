# T08 — Invoice Finalization & Detail View

**Status**: 🔒 Blocked (T07 must deploy first)
**Phase**: 2 — Invoices
**Requires**: T07 deployed
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

<!-- Your notes here — e.g. finalization transaction design, immutability enforcement, how status transitions work, snapshot timing -->

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
