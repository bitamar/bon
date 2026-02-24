# T18 — Business Dashboard

**Status**: 📝 Needs spec work (Product + Architect + UI Designer pass required)
**Phase**: 6 — Reporting
**Requires**: All five parallel streams merged (T09-B, T11, T14, T16, T-CRON-01). The dashboard aggregates data from invoices, payments, SHAAM status, and overdue flags — it cannot be built until all data sources exist.
**Blocks**: T19

---

## What & Why

The dashboard is a working tool, not a vanity metrics page. A business owner opens it first thing in the morning to know: what's outstanding, what's overdue, what came in this month. Every number should be a link to the filtered invoice list.

Must load in under 1 second — one aggregated query, not five separate calls.

---

## Recommended PR Split

- **PR 1 — Backend**: Dashboard aggregation endpoint, SQL query, Zod response schema, route tests
- **PR 2 — Frontend**: Dashboard page (replaces placeholder), metric cards, recent activity, component tests

---

## Acceptance Criteria

- [ ] Single API endpoint: `GET /businesses/:businessId/dashboard` — returns all metrics in one response
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

### Single Aggregated Query

Use a single SQL query with multiple CTEs to compute all metrics at once:

```sql
WITH monthly_revenue AS (
  SELECT COALESCE(SUM(total_incl_vat_minor_units), 0) AS total
  FROM invoices
  WHERE business_id = $1
    AND status != 'draft'
    AND invoice_date >= date_trunc('month', CURRENT_DATE AT TIME ZONE 'Asia/Jerusalem')
),
outstanding AS (
  SELECT
    COALESCE(SUM(total_incl_vat_minor_units), 0) AS total,
    COUNT(*) AS count
  FROM invoices
  WHERE business_id = $1
    AND status IN ('finalized', 'sent', 'partially_paid')
),
overdue AS (
  SELECT
    COALESCE(SUM(total_incl_vat_minor_units), 0) AS total,
    COUNT(*) AS count
  FROM invoices
  WHERE business_id = $1
    AND is_overdue = true
),
shaam_status AS (
  SELECT
    COUNT(*) FILTER (WHERE allocation_status = 'pending') AS pending_count,
    COUNT(*) FILTER (WHERE allocation_status = 'rejected') AS rejected_count
  FROM invoices
  WHERE business_id = $1
)
SELECT * FROM monthly_revenue, outstanding, overdue, shaam_status;
```

### "This Month" Timezone

Use `Asia/Jerusalem` timezone for "this month" calculation. The `CURRENT_DATE AT TIME ZONE 'Asia/Jerusalem'` expression ensures correct month boundaries regardless of server timezone.

### Recent Activity Data Source

Recent activity events are derived from **existing invoice fields** — there is no separate events table:

```sql
(SELECT 'created' AS event, id, document_number, customer_name, created_at AS event_at FROM invoices WHERE business_id = $1 ORDER BY created_at DESC LIMIT 5)
UNION ALL
(SELECT 'finalized', id, document_number, customer_name, issued_at FROM invoices WHERE business_id = $1 AND issued_at IS NOT NULL ORDER BY issued_at DESC LIMIT 5)
UNION ALL
(SELECT 'sent', id, document_number, customer_name, sent_at FROM invoices WHERE business_id = $1 AND sent_at IS NOT NULL ORDER BY sent_at DESC LIMIT 5)
UNION ALL
(SELECT 'paid', id, document_number, customer_name, paid_at FROM invoices WHERE business_id = $1 AND paid_at IS NOT NULL ORDER BY paid_at DESC LIMIT 5)
ORDER BY event_at DESC
LIMIT 5;
```

This gives the 5 most recent events across all event types. No additional tables needed.

### Response Schema

```typescript
dashboardResponseSchema = z.object({
  monthlyRevenueMinorUnits: z.number().int(),
  outstandingMinorUnits: z.number().int(),
  outstandingCount: z.number().int(),
  overdueMinorUnits: z.number().int(),
  overdueCount: z.number().int(),
  shaamPendingCount: z.number().int(),
  shaamRejectedCount: z.number().int(),
  recentActivity: z.array(z.object({
    event: z.enum(['created', 'finalized', 'sent', 'paid']),
    invoiceId: uuidSchema,
    documentNumber: nullableString,
    customerName: nullableString,
    eventAt: isoDateTime,
  })),
});
```

### Frontend Component Tree

```
Dashboard (page, replaces placeholder)
├── Container (size="lg")
│   ├── PageTitle "דשבורד"
│   ├── SimpleGrid (cols=3)
│   │   ├── MetricCard "הכנסות החודש" (₪X,XXX, link to list filtered by month)
│   │   ├── MetricCard "ממתין לתשלום" (₪X,XXX, N חשבוניות, link to list outstanding)
│   │   └── MetricCard "פגות מועד" (₪X,XXX, N חשבוניות, red, link to list overdue)
│   ├── [if shaamPending > 0 || shaamRejected > 0] ShaamStatusAlert
│   │   └── Alert: "X ממתינים למספר הקצאה, Y נדחו" + link to list
│   └── RecentActivityTimeline
│       └── Paper: Timeline of 5 recent events with icons and timestamps
```

### Caching

No caching for MVP — the CTE query is fast enough on expected data volumes (<10,000 invoices per business). Add index-based optimization later if needed.

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
