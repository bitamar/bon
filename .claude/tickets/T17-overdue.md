# T17 — Overdue Detection & Digest Email

**Status**: ✅ Detection merged (T-CRON-02), digest email implemented
**Phase**: 5 — Invoice Lifecycle
**Requires**: T-CRON-01 merged ✓
**Blocks**: T18

---

## What & Why

Unpaid invoices past their due date need visibility. A business owner who doesn't know an invoice is overdue can't chase payment. This is a background job that runs daily (detection at 6am, digest email at 6:05am).

---

## Acceptance Criteria

- [x] Daily cron job (pg-boss, 6am): find invoices with `status IN (finalized, sent, partially_paid)` and `dueDate < NOW()` and `dueDate IS NOT NULL`
- [x] Mark each as overdue (flag — `isOverdue` boolean on invoices table)
- [x] Digest email to business owner: list of overdue invoices with amounts and days overdue
- [ ] Email frequency: configurable (daily digest vs per-invoice notification) — **deferred** (not blocking, daily digest is the right default)
- [x] In invoice list UI: days overdue shown in red for overdue items
- [x] `npm run check` passes (type-check + lint + frontend tests confirmed; API tests need Docker/testcontainers)

---

## Architecture Notes

**Decision**: `isOverdue` is a boolean flag on the `invoices` table (not a separate status). Overdue is orthogonal to payment status (an invoice can be `sent` AND overdue).

### Overdue Detection (T-CRON-02, merged)
- Handler: `api/src/jobs/handlers/overdue-detection.ts`
- Schedule: 6:00 AM daily, Asia/Jerusalem
- Schema: `isOverdue` column + two partial indexes for efficient cron queries
- Reset: flag cleared for `paid`/`cancelled`/`credited` invoices
- Real-time reset: `invoice-service.ts` clears `isOverdue` on full payment

### Overdue Digest Email (this PR)
- Handler: `api/src/jobs/handlers/overdue-digest.ts`
- Schedule: 6:05 AM daily, Asia/Jerusalem (5 min after detection)
- Queries all overdue invoices, groups by business
- For each business: finds all owner emails, sends digest with RTL Hebrew template
- Template: table of overdue invoices (number, customer, amount, days overdue)
- Email failures are logged and don't block other businesses
- Template + subject builders: `api/src/services/email-service.ts`

### New Repository Methods
- `findUserById()` in `user-repository.ts`
- `findBusinessOwnerEmails()` in `user-business-repository.ts`

### Frontend
`InvoiceList.tsx` computes days overdue client-side from `dueDate` for display. The `isOverdue` flag from the server is the authority; the UI calculation is for display text ("באיחור X ימים").

---

## Links

- Branch: `claude/review-t17-0JnCF`
- PR: —
- Deployed: ⬜
