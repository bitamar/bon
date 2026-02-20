# T17 — Overdue Detection

**Status**: 🔒 Blocked (T16 must deploy first)
**Phase**: 5 — Invoice Lifecycle
**Requires**: T16 deployed
**Blocks**: T18

---

## What & Why

Unpaid invoices past their due date need visibility. A business owner who doesn't know an invoice is overdue can't chase payment. This is a background job that runs daily and sends a digest email.

---

## Acceptance Criteria

- [ ] Daily cron job (pg-boss, 6am): find invoices with `status IN (finalized, sent, partially_paid)` and `dueDate < NOW()` and `dueDate IS NOT NULL`
- [ ] Mark each as overdue (flag or status change — decide in architecture notes)
- [ ] Digest email to business owner: list of overdue invoices with amounts and days overdue
- [ ] Email frequency: configurable (daily digest vs per-invoice notification)
- [ ] In invoice list UI: days overdue shown in red for overdue items (already part of T09, wire up the flag here)
- [ ] `npm run check` passes

---

## Architecture Notes

<!-- Your notes here — e.g. overdue as a separate status vs a computed flag, how the digest email groups across multiple businesses owned by same user, cron schedule config -->

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
