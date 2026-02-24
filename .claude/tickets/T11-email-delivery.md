# T11 — Email Delivery

**Status**: 📝 Needs spec work (Product + Architect + UI Designer pass required)
**Phase**: 3 — PDF
**Requires**: T10 merged
**Blocks**: nothing (was blocking T12 — corrected, T12 no longer depends on T11)

---

## What & Why

Sending the invoice to the customer closes the loop. Without email, the business still has to download the PDF and attach it manually. This is the "send" action that completes the invoice workflow.

---

## Recommended PR Split

- **PR 1 — Backend**: Email service abstraction, Resend integration, `POST .../send` endpoint, `sentAt` + status transition, route tests
- **PR 2 — Frontend**: Send modal on invoice detail page, email confirmation UX, component tests

---

## Acceptance Criteria

### Backend

- [ ] `POST /businesses/:businessId/invoices/:invoiceId/send` — sends invoice by email
  - [ ] Body schema:
    ```typescript
    sendInvoiceBodySchema = z.object({
      recipientEmail: z.string().email().optional(),  // defaults to customerEmail snapshot
    }).strict();
    ```
  - [ ] Validation:
    - Invoice must be finalized, sent, paid, or partially_paid (not draft, cancelled, credited) — return 422 `invalid_status`
    - `recipientEmail` required if `invoice.customerEmail` is null — return 422 `missing_email`
  - [ ] Logic:
    1. Generate PDF via `PdfService.generateInvoicePdf()` (uses cache if available)
    2. Send email via `EmailService` with PDF attached
    3. If `invoice.status === 'finalized'`: transition to `sent`, set `sentAt = now()`
    4. If already `sent`/`paid`/`partially_paid`: re-send email, do NOT change status or `sentAt`
  - [ ] Returns 200 with `{ sentTo: string }` (the email address used)
- [ ] Re-sending is allowed — an invoice can be sent multiple times (to same or different email)
- [ ] `sentAt` is set only on the first send (never overwritten on re-send)

### EmailService Interface

- [ ] `EmailService` interface in `api/src/lib/email.ts`:
  ```typescript
  interface EmailService {
    sendInvoiceEmail(params: {
      to: string;
      subject: string;
      htmlBody: string;
      pdfAttachment: { filename: string; content: Buffer };
      replyTo?: string;
    }): Promise<{ messageId: string }>;
  }
  ```
- [ ] `ResendEmailService` implementation using [Resend](https://resend.com/docs) SDK
- [ ] `MockEmailService` for development/testing — logs to console, returns fake messageId
- [ ] Toggle via `EMAIL_MODE=mock|resend` env var (default `mock`)
- [ ] `RESEND_API_KEY` env var — required when `EMAIL_MODE=resend`
- [ ] `EMAIL_FROM` env var — sender address (e.g. `invoices@bon.co.il`), required when `EMAIL_MODE=resend`

### Email Template

- [ ] RTL Hebrew HTML email
- [ ] Subject: `{documentTypeLabel} {documentNumber} מ-{businessName}` (e.g. "חשבונית מס INV-0042 מ-בון בע"מ")
- [ ] Body structure:
  ```
  לכבוד {customerName},

  מצורפת {documentTypeLabel} מספר {documentNumber}.

  סכום לתשלום: ₪{totalInclVat}
  תאריך: {invoiceDate}
  תאריך פירעון: {dueDate} (if set)

  בברכה,
  {businessName}
  ```
- [ ] PDF attached with filename `{documentNumber}.pdf`
- [ ] No "download link" in MVP — just the attachment. Download links require signed URL infrastructure (defer to post-MVP).
- [ ] `replyTo` set to `business.email` if available

### Rate Limiting

- [ ] Max 10 sends per invoice per day (prevent accidental spam)
- [ ] Max 100 emails per business per day (prevent abuse)
- [ ] Rate limit check is in-memory (simple counter map, reset daily) — no DB table needed for MVP
- [ ] When limited: return 429 with message "חרגת ממגבלת השליחות היומית"

### Retry Logic

- [ ] If Resend API returns a transient error (5xx, network timeout): retry once with 2-second delay
- [ ] If retry fails: return 502 with message "שליחת המייל נכשלה. נסו שוב מאוחר יותר."
- [ ] Permanent errors (4xx from Resend — invalid email, etc.): return 422 with Resend's error message

### Frontend

- [ ] "שלח במייל" button on invoice detail page (replaces disabled placeholder from T08-D)
  - [ ] Only shown for statuses: `finalized`, `sent`, `paid`, `partially_paid`
  - [ ] On click: opens modal
- [ ] **Send modal** (size="sm"):
  - [ ] Header: "שליחת חשבונית במייל"
  - [ ] Body:
    - `TextInput` for email, prefilled from `invoice.customerEmail`, editable
    - Note below: "החשבונית תצורף כקובץ PDF"
  - [ ] Footer: "ביטול" (subtle) + "שלח" (loading state on click)
  - [ ] On success: close modal, success toast "החשבונית נשלחה בהצלחה ל-{email}", invalidate invoice query (status may have changed to `sent`)
  - [ ] On error: inline error in modal (do not close)
- [ ] Test: successful send flow, error handling, re-send with editable email

### General

- [ ] `npm run check` passes
- [ ] Route tests: successful send, missing email → 422, invalid status → 422, re-send doesn't change sentAt
- [ ] Frontend test: modal opens, send success, send error

---

## Architecture Notes

### Email Provider: Resend

**Decision**: Use [Resend](https://resend.com) for email delivery. Good developer experience, TypeScript SDK, good Hebrew support, reasonable pricing (free tier: 3,000 emails/month, then $20/month for 50,000).

Install: `npm install resend -w api`

### Environment Variables

Add to `api/src/env.ts`:
- `EMAIL_MODE` — `z.enum(['mock', 'resend']).default('mock')`
- `RESEND_API_KEY` — `z.string().optional()` (required when EMAIL_MODE=resend, validated at runtime)
- `EMAIL_FROM` — `z.string().email().optional()` (required when EMAIL_MODE=resend)

### Email Service Injection

Register as a Fastify plugin/decorator:
```typescript
// api/src/plugins/email.ts
app.decorate('emailService', createEmailService(app.config));
```

The route handler accesses it via `app.emailService`.

### What Triggers PDF Generation if Not Cached?

If the user clicks "שלח במייל" and no cached PDF exists, the send endpoint calls `PdfService.generateInvoicePdf()` which generates on-the-fly. This may add 2-3 seconds to the send request. The frontend loading state should handle this gracefully.

### No Unsubscribe Mechanism (MVP)

These are transactional emails (invoice delivery), not marketing. No unsubscribe link required under Israeli spam law (תיקון 40 לחוק התקשורת) for transactional emails sent to existing business relationships.

---

## Open Questions (need Product decision)

| # | Question | Default if no answer |
|---|----------|---------------------|
| 1 | Should we track email delivery status (bounced, opened)? | No — defer to post-MVP. Resend provides webhooks for this. |
| 2 | Should the email include a link to view the invoice online? | No — requires a client portal (post-MVP). Just attach the PDF. |

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
