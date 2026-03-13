# T17 — Overdue Detection

**Status**: ✅ Absorbed into T-CRON-02 (overdue detection handler implemented and merged)
**Phase**: 5 — Invoice Lifecycle
**Requires**: T-CRON-01 merged ✓
**Blocks**: T18

---

## What & Why

Unpaid invoices past their due date need visibility. A business owner who doesn't know an invoice is overdue can't chase payment. This is a background job that runs daily and sends a digest email.

---

## Acceptance Criteria

- [x] Daily cron job (pg-boss, 6am): find invoices with `status IN (finalized, sent, partially_paid)` and `dueDate < NOW()` and `dueDate IS NOT NULL`
- [x] Mark each as overdue (flag — `isOverdue` boolean on invoices table)
- [ ] Digest email to business owner: list of overdue invoices with amounts and days overdue — **deferred** (see review notes)
- [ ] Email frequency: configurable (daily digest vs per-invoice notification) — **deferred** (see review notes)
- [x] In invoice list UI: days overdue shown in red for overdue items
- [x] `npm run check` passes (type-check + lint + frontend tests confirmed; API tests need Docker/testcontainers)

---

## Architecture Notes

**Decision**: `isOverdue` is a boolean flag on the `invoices` table (not a separate status). This is correct — overdue is orthogonal to payment status (an invoice can be `sent` AND overdue).

**Implementation** (in T-CRON-02):
- Handler: `api/src/jobs/handlers/overdue-detection.ts`
- Registration: `api/src/plugins/maintenance-jobs.ts` (6am daily, Asia/Jerusalem)
- Schema: `isOverdue` column + two partial indexes for efficient cron queries
- Reset: flag cleared for `paid`/`cancelled`/`credited` invoices
- Additionally, `invoice-service.ts` clears `isOverdue` on full payment (line 587-588) — real-time reset without waiting for the next cron run

**Frontend**: `InvoiceList.tsx` computes days overdue client-side from `dueDate` for display. The `isOverdue` flag from the server is available in the schema but the UI uses client-side calculation for the display text ("באיחור X ימים"), which is fine — the flag is the server authority, the UI calculation is for display.

---

## Review Notes (2026-03-13)

### What's Done Well

1. **Handler is clean and idempotent** — two SQL updates, no complex logic, exactly matches the T-CRON-02 spec
2. **Partial indexes** — `invoices_overdue_candidates_idx` and `invoices_overdue_reset_idx` ensure the cron queries are efficient at scale
3. **Reset scope is correct** — covers `paid`, `cancelled`, and `credited` (all terminal statuses)
4. **Real-time reset on payment** — `invoice-service.ts` clears `isOverdue` when a payment fully pays the invoice, so users don't have to wait until 6am
5. **Test coverage is solid** — 7 test cases covering mark, skip (future/null), reset (paid/cancelled/credited), and idempotency
6. **Typed job registry** — `JobPayloads['overdue-detection']` ensures type safety throughout

### Deferred Items (Not Blocking)

These items from the original T17 spec were intentionally deferred:

1. **Digest email** — T17 originally called for a daily digest email to business owners listing overdue invoices. The cron handler currently logs the count but doesn't send email. This is reasonable — email infrastructure (Resend) exists from T11, but the digest template and per-business grouping logic would add scope. **Recommend creating a follow-up ticket** (e.g., T17-B or T-EMAIL-01) for the overdue digest email.

2. **Configurable email frequency** — No configuration for daily vs per-invoice notifications. This can be addressed alongside the digest email ticket.

### Minor Observations (Non-Blocking)

1. **Frontend uses client-side calculation, not `isOverdue` flag** — The `InvoiceList.tsx` `daysOverdue()` function calculates overdue status from `dueDate` directly rather than using the server's `isOverdue` flag. This means the UI shows overdue status immediately without waiting for the cron job, which is actually better UX. However, the `isOverdue` field in the API response is currently unused by the frontend. This is fine — the flag exists for future features (dashboard aggregates in T18, email digest).

2. **`daysOverdue()` date parsing** — The function manually parses the date string (`dueDate.split('-').map(Number)`) rather than using `new Date(dueDate)`. This avoids timezone-related off-by-one errors (UTC vs local), which is correct per the review rules about timezone-consistent formatting.

---

## Links

- Branch: — (absorbed into T-CRON-02)
- PR: — (part of T-CRON-02 PR)
- Deployed: ⬜
