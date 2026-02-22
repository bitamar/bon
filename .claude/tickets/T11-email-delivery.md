# T11 — Email Delivery

**Status**: 🔒 Blocked (T10 must merge first)
**Phase**: 3 — PDF
**Requires**: T10 merged
**Blocks**: T12

---

## What & Why

Sending the invoice to the customer closes the loop. Without email, the business still has to download the PDF and attach it manually. This is the "send" action that completes the invoice workflow.

---

## Acceptance Criteria

- [ ] `POST /businesses/:businessId/invoices/:invoiceId/send` — sends invoice by email
  - [ ] Body: `{ recipientEmail?: string }` — defaults to `customer.email` if not provided
  - [ ] Attaches PDF to email
  - [ ] Sets `sentAt` on invoice, status → `sent`
  - [ ] Returns error if no email address available
- [ ] Email design:
  - [ ] RTL Hebrew
  - [ ] Subject: `חשבונית מס INV-0042 מ-{businessName}`
  - [ ] Body: basic invoice summary (customer, amount, due date) + download link
  - [ ] PDF attached
- [ ] "שלח במייל" button on invoice detail page triggers this flow
  - [ ] Prefills recipient email from customer, editable
  - [ ] Confirm modal before sending
  - [ ] Success toast + status updates in UI
- [ ] `npm run check` passes

---

## Architecture Notes

<!-- Your notes here — e.g. email provider (Resend), template structure, how attachments work, signed PDF URL vs direct attachment -->

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
