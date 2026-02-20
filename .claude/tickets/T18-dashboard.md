# T18 — Business Dashboard

**Status**: 🔒 Blocked (T17 must deploy first)
**Phase**: 6 — Reporting
**Requires**: T17 deployed
**Blocks**: T19

---

## What & Why

The dashboard is a working tool, not a vanity metrics page. A business owner opens it first thing in the morning to know: what's outstanding, what's overdue, what came in this month. Every number should be a link to the filtered invoice list.

Must load in under 1 second — one aggregated query, not five separate calls.

---

## Acceptance Criteria

- [ ] Single API endpoint: `GET /businesses/:id/dashboard` — returns all metrics in one response
- [ ] Metrics:
  - [ ] הכנסות החודש (total finalized this calendar month, incl. VAT)
  - [ ] ממתין לתשלום (sum of unpaid finalized invoices + count)
  - [ ] פגות מועד (sum of overdue invoices + count, highlighted in red)
- [ ] Recent activity: last 5 invoice events (created, finalized, sent, paid) with timestamps
- [ ] SHAAM status: count of pending allocation requests, count of rejected
- [ ] All numbers link to filtered invoice list (correct filter pre-applied)
- [ ] Dashboard replaces the current placeholder `Dashboard.tsx`
- [ ] Loads in < 1 second (verified with query explain)
- [ ] `npm run check` passes

---

## Architecture Notes

<!-- Your notes here — e.g. single aggregated SQL query design, how "this month" is calculated (UTC vs Israel timezone), caching strategy -->

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
