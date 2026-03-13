# T18 — Business Dashboard

**Status**: ⬜ Not started
**Phase**: 6 — Reporting
**Requires**: T15 + T16 merged (payments + credit notes provide the data)
**Blocks**: T19

---

## What & Why

The dashboard is a working tool, not a vanity metrics page. A business owner opens it first thing in the morning to know: what's outstanding, what's overdue, what came in this month. Every number should be a link to the filtered invoice list.

Must load in under 1 second — one aggregated query, not five separate calls.

---

## Acceptance Criteria

- [ ] Single API endpoint: `GET /businesses/:businessId/dashboard` — returns all metrics in one response
- [ ] KPIs (4 cards):
  - [ ] **הכנסות החודש** — `SUM(totalInclVatMinorUnits)` for invoices with `invoiceDate` in current calendar month (Israel timezone) and `status IN (finalized, sent, paid, partially_paid, credited)`. Trend: compare to previous calendar month.
  - [ ] **חשבוניות החודש** — count of finalized invoices this calendar month. Trend: vs prev month.
  - [ ] **ממתין לתשלום** — sum + count of invoices with `status IN (finalized, sent, partially_paid)`. Use existing `aggregateOutstanding()`.
  - [ ] **פגות מועד** — sum + count of invoices with `isOverdue = true` and `status IN (finalized, sent, partially_paid)`. Highlighted in red.
- [ ] **Recent invoices**: last 10 invoices ordered by `updatedAt DESC` (not an activity feed — no audit log exists yet)
- [ ] **SHAAM status**: count of `allocationStatus = 'pending'` + count of `allocationStatus = 'rejected'`. Rendered conditionally — hidden when both are 0.
- [ ] KPI cards are clickable links to the filtered invoice list:
  - הכנסות: `?dateFrom=YYYY-MM-01&dateTo=YYYY-MM-DD&status=finalized,sent,paid,partially_paid`
  - ממתין לתשלום: `?status=finalized,sent,partially_paid`
  - פגות מועד: `?status=finalized,sent,partially_paid` (overdue filter not supported yet — link to outstanding for now)
- [ ] Dashboard replaces the current mock-data placeholder in `Dashboard.tsx`
- [ ] Loads in < 1 second (6 parallel indexed queries via `Promise.all`)
- [ ] API route has tests (happy path + empty business with no invoices)
- [ ] Dashboard page has tests (renders KPIs, handles loading, handles empty state)
- [ ] Repository aggregate methods have tests
- [ ] `npm run check` passes

---

## Architecture Notes

### API Response Schema

Add `types/src/dashboard.ts`:

```typescript
export const dashboardResponseSchema = z.object({
  revenueThisMonthMinorUnits: z.number(),
  revenuePrevMonthMinorUnits: z.number(),
  invoiceCountThisMonth: z.number(),
  invoiceCountPrevMonth: z.number(),
  outstandingAmountMinorUnits: z.number(),
  outstandingCount: z.number(),
  overdueAmountMinorUnits: z.number(),
  overdueCount: z.number(),
  shaamPendingCount: z.number(),
  shaamRejectedCount: z.number(),
  recentInvoices: z.array(invoiceListItemSchema).max(10),
});
```

### Date/Timezone Semantics

- "This month" = current calendar month in **Asia/Jerusalem** timezone
- Date field: use `invoiceDate` (business-facing date, not `createdAt`)
- Trend calculation: compare to previous full calendar month
- Month boundaries calculated server-side, passed as date strings to repository

### Query Strategy

Use `Promise.all` in the service layer — NOT a single CTE query. Six small indexed queries will complete in < 50ms combined on any reasonable dataset. Simpler to read, test, and maintain.

```typescript
// In dashboard-service.ts or invoice-service.ts
const [revenue, prevRevenue, outstanding, overdue, shaam, recent] = await Promise.all([
  repo.aggregateRevenue(businessId, monthStart, monthEnd),
  repo.aggregateRevenue(businessId, prevMonthStart, prevMonthEnd),
  repo.aggregateOutstanding({ businessId, ... }),  // existing method
  repo.aggregateOverdue(businessId),               // new method
  repo.aggregateShaamStatus(businessId),           // new method
  repo.findInvoices({ businessId, sort: 'updatedAt:desc', limit: 10, offset: 0 }),
]);
```

### New Repository Methods

Add to `invoice-repository.ts`:

1. **`aggregateRevenue(businessId, dateFrom, dateTo)`** → `{ totalMinorUnits: number, count: number }`
   - `SUM(totalInclVatMinorUnits)` + `COUNT(*)` WHERE `invoiceDate BETWEEN` AND `status IN (finalized, sent, paid, partially_paid, credited)`
   - Uses existing `invoices_business_date_idx`

2. **`aggregateOverdue(businessId)`** → `{ totalMinorUnits: number, count: number }`
   - `SUM(totalInclVatMinorUnits)` + `COUNT(*)` WHERE `isOverdue = true` AND `status IN (finalized, sent, partially_paid)`

3. **`aggregateShaamStatus(businessId)`** → `{ pending: number, rejected: number }`
   - Two `COUNT(*)` with `allocationStatus = 'pending'` / `'rejected'`

### Frontend Changes

1. **Replace mock hook**: Delete `useDashboardData.ts`. Create `front/src/api/dashboard.ts` with `fetchDashboard(businessId)`.
2. **Query key**: Add `dashboard: (businessId: string) => ['businesses', businessId, 'dashboard']` to `queryKeys.ts`.
3. **Hook**: Use `useQuery({ queryKey: queryKeys.dashboard(businessId), queryFn: ... })` directly in Dashboard.tsx.
4. **Types**: Import from `@bon/types/dashboard`.
5. **KPI mapping**: Map API response fields to the 4 KPI cards. Calculate trend percentages client-side: `((current - prev) / prev) * 100`.
6. **Clickable KPIs**: Wrap KpiCard in `<Link>` to filtered invoice list.
7. **Drop ActivityFeed**: Replace with SHAAM status card (conditional). Keep QuickActions.

### Existing Placeholder Components to Reuse

- `KpiCard` — loading/data states already done, just wire real data
- `RecentInvoicesTable` — loading/empty/data states done, make rows clickable (link to invoice detail)
- `QuickActions` — no changes needed

### Components to Remove/Replace

- `ActivityFeed` — remove (no audit log to feed it). Replace with conditional `ShaamStatusCard` when SHAAM data exists.
- `useDashboardData` hook — delete entirely, replace with TanStack Query

### PR Scope Estimate

- `types/src/dashboard.ts` — ~30 lines (Zod schema)
- `api/src/repositories/invoice-repository.ts` — ~40 lines (3 new methods)
- `api/src/services/invoice-service.ts` or new `dashboard-service.ts` — ~50 lines
- `api/src/routes/dashboard.ts` — ~30 lines (single GET endpoint)
- `api/src/app.ts` — ~2 lines (register route)
- `front/src/api/dashboard.ts` — ~15 lines
- `front/src/lib/queryKeys.ts` — ~1 line
- `front/src/pages/Dashboard.tsx` — ~60 lines (rewrite with real data)
- `front/src/hooks/useDashboardData.ts` — DELETE
- Tests: ~150 lines (repo + route + frontend)
- Total: ~380 lines changed, ≤10 files — fits in one PR

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
