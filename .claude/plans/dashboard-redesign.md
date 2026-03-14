# Dashboard Redesign Plan

## Problem

The dashboard (`front/src/pages/Dashboard.tsx`) is entirely mock data. The `useDashboardData` hook fakes a 300ms delay and returns hardcoded numbers. The page title is "ראשי" (Main) — generic and meaningless. This is the first thing a user sees after login, and it should immediately answer: **"What do I need to deal with today?"**

## Design Philosophy

This isn't a reporting dashboard. It's a **daily workbench** — the place a business owner or bookkeeper opens every morning. Every element must either:
1. Tell you something you need to act on **right now**, or
2. Get you to the right action in **one click**

No vanity metrics. No charts for the sake of charts. No "active customers" count that never changes.

Rename from "ראשי" to **"דאשבורד"** (Overview) — descriptive without being pretentious.

---

## What the Dashboard Should Show

### Row 1: Action-Required Alerts (conditional — only when there's something to act on)

A colored alert bar at the top, shown only when attention is needed:

| Condition | Alert | Color | Link |
|-----------|-------|-------|------|
| Overdue invoices exist | `2 חשבוניות פגות מועד — ₪4,200` | Red | → Invoice list filtered to overdue |
| Drafts older than 7 days | `3 טיוטות ממתינות להפקה` | Yellow | → Invoice list filtered to drafts |
| SHAAM allocation pending/failed (future) | `1 חשבונית ממתינה לאישור שע"מ` | Orange | → Invoice detail |

Implementation: These come from the same API call as the KPIs. Zero alerts = this section doesn't render at all. No empty state needed — silence means everything is fine.

### Row 2: KPI Cards (4 cards)

Replace the current mock KPIs with numbers that actually matter:

| KPI | What it shows | How to compute | Trend |
|-----|--------------|----------------|-------|
| **ממתין לתשלום** (Awaiting Payment) | Total ₪ of outstanding invoices (finalized + sent + partially_paid) | `aggregateOutstanding()` — already exists | vs. previous month |
| **הכנסות החודש** (This Month's Revenue) | Total ₪ of invoices paid this calendar month | New: sum of `invoice_payments.amountMinorUnits` where `paidAt` is current month | vs. previous month |
| **חשבוניות החודש** (Invoices This Month) | Count of invoices finalized this month | New: count where `finalizedAt` >= first of month | vs. previous month |
| **פגות מועד** (Overdue) | Count + total ₪ of overdue invoices | New: filter `isOverdue = true` on outstanding | — (no trend, just count) |

The "Overdue" card should be **red-tinted** when > 0. It links to the filtered invoice list.

**Why these 4?** "Awaiting Payment" is what keeps a business owner up at night. "Revenue" validates they're making money. "Invoices This Month" shows activity. "Overdue" is a call to action. The old "Active Customers" and "Average Invoice" are interesting but not actionable — drop them.

### Row 3: Two-Column Layout

**Left column (8/12): Recent Invoices — keep but make real**

The `RecentInvoicesTable` component is already well-structured. Replace mock data with real data:
- Fetch the 10 most recently created/updated invoices via the existing `GET /businesses/:businessId/invoices` endpoint (sorted by `updatedAt desc`, limit 10)
- Show: invoice number, customer name, amount (formatted), status badge, date
- Each row is clickable → navigates to invoice detail
- "הצג הכל" link at bottom → full invoice list

**Right column (4/12): Quick Actions + Overdue List**

**Quick Actions** — keep the existing component but refine:
- "חשבונית חדשה" (primary, prominent)
- "לקוח חדש" (secondary)
- Remove "הגדרות עסק" — it's in the nav, doesn't belong on a daily workbench

**Overdue invoices mini-list** (replaces ActivityFeed):
- Show up to 5 overdue invoices: customer name, amount, days overdue
- Red accent for > 30 days overdue
- Each row clickable → invoice detail
- If none overdue: show a green "אין חשבוניות פגות מועד" message (positive reinforcement)

**Why kill the ActivityFeed?** The mock activity feed shows events like "customer added" and "invoice created" — these are low-signal. A bookkeeper doesn't need to see what they just did. They need to see what needs attention. If we ever add a real activity log, it belongs on a dedicated page, not the dashboard.

---

## API Design

### New Endpoint: `GET /businesses/:businessId/dashboard`

A single endpoint that returns everything the dashboard needs in one round-trip. The PLAN.md says "load in under 1 second (single aggregated query, not 5 separate calls)."

```typescript
// types/src/dashboard.ts
interface DashboardResponse {
  kpis: {
    outstanding: { totalMinorUnits: number; count: number };
    overdue: { totalMinorUnits: number; count: number };
    revenue: { thisMonthMinorUnits: number; prevMonthMinorUnits: number };
    invoicesThisMonth: { count: number; prevMonthCount: number };
    staleDraftCount: number;
  };
  recentInvoices: InvoiceListItem[];    // 10 most recent (reuse existing type)
  overdueInvoices: InvoiceListItem[];   // up to 5, for the mini-list
  hasInvoices: boolean;                 // false for new businesses (welcome state)
}
```

### Implementation: Dashboard Service

New file: `api/src/services/dashboard-service.ts`

Calls existing repository functions in parallel:
1. `aggregateOutstanding(businessId)` — already exists
2. New query: sum payments this month + previous month
3. New query: count invoices finalized this month + previous month
4. New query: overdue invoices (isOverdue = true, limit 5)
5. `findInvoices(businessId, { sort: 'date:desc', limit: 10 })` — already exists
6. New query: count drafts older than 7 days

All 6 queries run via `Promise.all` — single round-trip to the DB connection pool.

### New Repository Functions Needed

In `invoice-repository.ts`:
- `sumPaymentsForPeriod(businessId, dateFrom, dateTo)` — aggregate from `invoice_payments`
- `countFinalizedForPeriod(businessId, dateFrom, dateTo)` — count invoices with `finalizedAt` in range
- `findOverdueInvoices(businessId, limit)` — where `isOverdue = true`, sorted by due date
- `countStaleDrafts(businessId, olderThan: Date)` — drafts with `updatedAt` < threshold

### New Route

`api/src/routes/dashboard-routes.ts` — registered in `app.ts`:
```text
GET /businesses/:businessId/dashboard
→ dashboardService.getDashboardData(businessId)
→ DashboardResponse
```

---

## Frontend Changes

### Replace `useDashboardData` Hook

Delete `front/src/hooks/useDashboardData.ts` entirely. Replace with:

`front/src/api/dashboard.ts`:
- `fetchDashboard(businessId): Promise<DashboardResponse>` using `fetchJson`

`front/src/pages/Dashboard.tsx`:
- Use `useQuery` with `queryKeys.dashboard(businessId)`
- Rename page title from "ראשי" to "דאשבורד"

### Component Changes

**Keep (with real data):**
- `KpiCard` — works great, just wire to real numbers
- `RecentInvoicesTable` — adjust to accept `InvoiceListItem[]` instead of mock type
- `QuickActions` — remove settings link

**Delete:**
- `ActivityFeed` — replaced by overdue mini-list

**New:**
- `DashboardAlerts` — renders the conditional alert bars
- `OverdueMiniList` — compact list of overdue invoices for sidebar

### Empty State (New Business)

When a business has zero invoices, the entire dashboard should show a **welcome state** instead of zeroed-out KPIs:

```text
┌─────────────────────────────────────────┐
│                                         │
│   ברוכים הבאים ל-BON!                   │
│                                         │
│   הצעד הראשון: הוסיפו לקוח ראשון       │
│   [+ לקוח חדש]                          │
│                                         │
│   או צרו חשבונית ישירות:               │
│   [+ חשבונית חדשה]                      │
│                                         │
└─────────────────────────────────────────┘
```

This is better than showing 4 cards that all say ₪0.

---

## Implementation Steps

### Step 1: Shared Types (types/)
- Create `types/src/dashboard.ts` with Zod schemas for `DashboardResponse`, `OverdueSummaryItem`, `DashboardAlert`

### Step 2: Backend — Repository + Service + Route
- Add new repository queries (payments sum, finalized count, overdue list, stale drafts count)
- Create `dashboard-service.ts` with `getDashboardData()` that runs all queries in parallel
- Create `dashboard-routes.ts`, register in `app.ts`
- Tests: happy path (business with invoices) + empty business + auth check

### Step 3: Frontend — API + Hook + Page
- Create `front/src/api/dashboard.ts`
- Rewrite `Dashboard.tsx` to use real data via `useQuery`
- Rename title to "דאשבורד"
- Wire KPI cards to real numbers with trend calculation
- Wire recent invoices table to real `InvoiceListItem[]`
- Add query key to `queryKeys.ts`

### Step 4: New Components
- `DashboardAlerts` component (conditional alert bars)
- `OverdueMiniList` component (replaces ActivityFeed)
- Welcome/empty state for new businesses
- Delete `ActivityFeed` component and `useDashboardData` hook

### Step 5: Tests
- API: dashboard route tests (with invoices, empty business, non-member 404)
- Frontend: dashboard page renders KPIs from API, shows alerts when overdue, shows empty state

---

## What This Does NOT Include

- Charts or graphs (not needed for MVP — raw numbers are more useful for small businesses)
- Date range selector (this month is the right default; historical comparison is a reporting feature)
- SHAAM status section (alerts will cover it once Phase 4 lands — the alert type is already in the schema)
- Revenue forecasting or trends beyond month-over-month
- Customizable dashboard layout
