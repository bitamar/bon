# T09 — Invoice List & Search

**Status**: 🔒 Blocked (T08 must merge first)
**Phase**: 2 — Invoices
**Requires**: T08 merged

---

## What & Why

The invoice list is an accountant's working environment. They live here. It must be filterable, sortable, and show summary totals for the filtered set. From day one it must be server-side paginated — don't build a list that breaks at 500 invoices.

---

## Recommended PR Split

This ticket must be split into two PRs:
- **PR 1 — Backend**: `GET /businesses/:businessId/invoices` endpoint, `invoiceListQuerySchema`, `invoiceListResponseSchema`, repository method `findInvoices()`, service method `listInvoices()`, route handler, and tests
- **PR 2 — Frontend**: Invoice list page, filter chips, customer typeahead, date range, pagination, empty states, and tests

PR 2 cannot start until PR 1 is merged.

---

## Acceptance Criteria

### Backend

- [ ] `GET /businesses/:businessId/invoices` endpoint with query params:
  - `status`: comma-separated list of valid statuses (invalid values → 422)
  - `customerId`: UUID, filter to this customer only
  - `documentType`: enum from `documentTypeSchema`, optional
  - `dateFrom`: ISO date (YYYY-MM-DD). Returns invoices with `invoiceDate >= dateFrom`
  - `dateTo`: ISO date. If `dateFrom > dateTo` → 422 with message "תאריך סיום חייב להיות אחרי תאריך התחלה"
  - `q`: search string (max 100 chars). Searches `documentNumber` (ILIKE) and `customerName` (ILIKE). Case-insensitive. ANDed with other filters. Uses `escapeLikePattern()`.
  - `sort`: enum. Valid: `invoiceDate:asc`, `invoiceDate:desc`, `dueDate:asc`, `dueDate:desc`, `totalInclVatMinorUnits:asc`, `totalInclVatMinorUnits:desc`, `createdAt:desc`. Default: `invoiceDate:desc`. Invalid → 422.
  - `page`: positive integer, default 1
  - `limit`: positive integer, max 200, default 20
- [ ] `invoiceListQuerySchema` defined in `types/src/invoices.ts`
- [ ] Response schema: `{ invoices: InvoiceListItem[], total: number }`
- [ ] **Aggregates deferred to T09-B** — summary row (totalOutstanding, totalFiltered) ships separately
- [ ] `invoiceListResponseSchema` defined in `types/src/invoices.ts`
- [ ] Update `invoiceListItemSchema` to include `dueDate` and `currency` (needed for client-side overdue calculation and display)
- [ ] Null `dueDate` sorts last when sorting by due date
- [ ] Multi-tenant isolation: cannot list another business's invoices (404)
- [ ] Tests: happy path, filter by status, filter by customer, date range, `dateFrom > dateTo` → 422, `q` search, pagination, sort, multi-tenant isolation

### Frontend

- [ ] Invoice list page at `/business/invoices`
  - [ ] Route registered in `App.tsx`
  - [ ] "חשבונית חדשה" primary action button (navigates to `/business/invoices/new`)
- [ ] Loading state: skeleton rows (5 skeleton rows)
- [ ] Error state: error card with retry button
- [ ] **Filter chips** (single-select, `Chip.Group`):
  - "כל החשבוניות" → no status filter
  - "טיוטות" → `status=draft`
  - "ממתינות לתשלום" → `status=finalized,sent,partially_paid`
  - "שולמו" → `status=paid`
  - "בוטלו" → `status=cancelled`
- [ ] Default view: "ממתינות לתשלום" chip active, sorted by `dueDate:asc` (oldest due first — collections workflow)
- [ ] **Each table row shows**:
  - Invoice number (`documentNumber`, or "טיוטה" in gray for drafts with null `documentNumber`)
  - Document type badge: "חשבונית מס" / "חשבונית מס קבלה" / "קבלה" / "חשבונית זיכוי"
  - Customer name (`customerName` for finalized; "לא נבחר לקוח" if null on draft)
  - Invoice date
  - Total incl. VAT (formatted as ₪)
  - Status badge (all 7 statuses, shared config from T08's `invoiceStatus.ts`)
  - Overdue indicator: when `dueDate` < today AND status in [`finalized`, `sent`, `partially_paid`] → show "באיחור X ימים" in red. Compute client-side from `dueDate`.
- [ ] Clicking a row navigates to `/business/invoices/:id`
- [ ] **Secondary filters**:
  - Customer typeahead: uses `GET /businesses/:businessId/customers?q=` endpoint, debounced 150ms. Reuse `CustomerSelect` component from T7.5.
  - Date range: two `DatePickerInput` components (from/to), clearable
- [ ] **Pagination**: 20 per page, Mantine `Pagination` component. Resets to page 1 when any filter changes.
- [ ] **URL search params**: All filter state lives in URL params (`?status=outstanding&page=2&customerId=...`) via `useSearchParams`. Enables bookmarking and back-button.
- [ ] **Empty states**:
  - Zero invoices total: "עדיין לא הפקת חשבוניות. לחץ 'חשבונית חדשה' להתחיל." with CTA button
  - Zero results with active filter: "לא נמצאו חשבוניות התואמות את החיפוש. נסו לשנות את הסינון."
- [ ] **Summary row**: deferred to T09-B (placeholder space reserved in layout)
- [ ] Filter change shows loading overlay on table (opacity 0.4 + Loader), not full skeleton (prevents layout shift)

### General

- [ ] `npm run check` passes
- [ ] All new repository methods have tests
- [ ] Route handler tests: happy path + at least one error case
- [ ] Frontend list page test: renders rows, filter changes trigger refetch, empty states

---

## Component Tree

```
InvoiceList (page)
├── Container (size="lg")
│   ├── Group (justify="space-between", mb="md")
│   │   ├── PageTitle "חשבוניות"
│   │   └── Button (leftSection=IconPlus, component=Link) "חשבונית חדשה"
│   │
│   ├── InvoiceFilters (Paper, withBorder, p="md", mb="md")
│   │   └── Stack (gap="sm")
│   │       ├── Chip.Group (single select, status filter chips)
│   │       │   └── Group (gap="xs"): 5 chips
│   │       ├── Grid (secondary filters)
│   │       │   ├── CustomerSelect (reused from T07)
│   │       │   ├── DatePickerInput "מתאריך" (clearable)
│   │       │   └── DatePickerInput "עד תאריך" (clearable)
│   │       └── [if filters active] Active filter badges + "נקה הכל" button
│   │
│   ├── [T09-B] InvoiceSummaryRow (placeholder space, content deferred)
│   │
│   ├── [loading] 5 × Skeleton (height=60)
│   ├── [error] Error card with retry
│   ├── [empty, no filters] Empty state with "חשבונית חדשה" CTA
│   ├── [empty, filters active] "לא נמצאו חשבוניות" + "נקה פילטרים"
│   ├── [data] Table (highlightOnHover, withRowBorders)
│   │   ├── Thead: מספר | סוג | לקוח | תאריך | סכום | סטטוס
│   │   └── Tbody: rows with onClick navigation to detail page
│   │       each row: documentNumber, docType badge, customerName, date+overdue, amount, statusBadge
│   │
│   └── [data, total > limit] Pagination (centered, withEdges)
```

---

## Architecture Notes

### Zod Schemas

**Query schema** — add to `types/src/invoices.ts`:

```typescript
export const invoiceListQuerySchema = z.object({
  status: z.string().trim().optional(),              // comma-separated, validated against invoiceStatusSchema
  customerId: uuidSchema.optional(),
  documentType: documentTypeSchema.optional(),
  dateFrom: z.string().trim().date().optional(),
  dateTo: z.string().trim().date().optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.string().trim().optional(),                // "field:direction", validated against whitelist
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(20),
});
```

**Update `invoiceListItemSchema`** — add `dueDate` and `currency`:

```typescript
export const invoiceListItemSchema = z.object({
  id: uuidSchema,
  businessId: uuidSchema,
  customerId: z.union([uuidSchema, z.literal(null)]),
  customerName: nullableString,
  documentType: documentTypeSchema,
  status: invoiceStatusSchema,
  isOverdue: z.boolean(),
  documentNumber: nullableString,
  invoiceDate: z.string(),
  dueDate: z.union([z.string(), z.literal(null)]),    // needed for client-side overdue calc
  totalInclVatMinorUnits: z.number().int(),
  currency: z.string(),
  createdAt: isoDateTime,
});
```

**List response** (aggregates deferred to T09-B):

```typescript
export const invoiceListResponseSchema = z.object({
  invoices: z.array(invoiceListItemSchema),
  total: z.number().int().nonnegative(),
});
```

### Sort Whitelist

```typescript
const ALLOWED_SORTS = ['invoiceDate:asc', 'invoiceDate:desc', 'dueDate:asc', 'dueDate:desc',
  'totalInclVatMinorUnits:asc', 'totalInclVatMinorUnits:desc', 'createdAt:desc'] as const;
```

Default: `invoiceDate:desc`. For "outstanding" view, frontend passes `sort=dueDate:asc` (oldest due first). Null `dueDate` sorts last.

### Repository Layer

Add to `invoice-repository.ts`:

```
findInvoices(filters: InvoiceListFilters, txOrDb?): Promise<InvoiceRecord[]>
countInvoices(filters, txOrDb?): Promise<number>
// aggregateOutstanding + aggregateFiltered → deferred to T09-B
```

Text search uses `escapeLikePattern()` from `query-utils.ts`:
```typescript
if (filters.q) {
  const pattern = `%${escapeLikePattern(filters.q)}%`;
  conditions.push(or(ilike(invoices.customerName, pattern), ilike(invoices.documentNumber, pattern)));
}
```

### Service Layer

```
listInvoices(businessId: string, query: InvoiceListQuery): Promise<InvoiceListResponse>
```

Runs 2 queries: paginated list + total count. Aggregates deferred to T09-B.

### Pagination

Offset-based: `offset = (page - 1) * limit`. The `total` field enables frontend to compute total pages.

### Index Considerations

Existing indexes are sufficient for MVP:
- `(businessId, status)` — status filter
- `(businessId, invoiceDate)` — date range + default sort
- `(businessId, customerId)` — customer filter

Defer additional indexes until query performance monitoring shows need.

### Status Filter Chip Mapping

```
"כל החשבוניות"      → no status filter
"טיוטות"            → status=draft
"ממתינות לתשלום"    → status=finalized,sent,partially_paid
"שולמו"             → status=paid
"בוטלו"             → status=cancelled
```

### Null `documentNumber` Display

Draft invoices have `documentNumber = null`. Display "טיוטה" styled in gray.

### Credit Notes (T16)

When T16 ships, credit note rows will appear in this list. The table structure and document type badge already accommodate this. Do not add code that assumes `documentType` is only `tax_invoice` or `tax_invoice_receipt`.

### Frontend Query Key

```
invoiceList: (businessId: string, params: Record<string, string>) =>
  ['businesses', businessId, 'invoices', 'list', params] as const,
```

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
