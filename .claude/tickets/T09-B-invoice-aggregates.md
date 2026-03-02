# T09-B — Invoice List Aggregates & Summary Row

**Status**: 🚧 In Progress
**Phase**: 2 — Invoices
**Requires**: T09 merged (done)

---

## What & Why

The invoice list's summary row shows aggregate totals: "סה"כ לגבייה" (total outstanding) and "סה"כ בסינון" (total in current filter). These require additional database queries with different WHERE clauses than the main list query. Deferred from T09 to keep the list PR focused.

---

## Deliverables

### Backend

- [ ] Add `aggregates` field to `invoiceListResponseSchema`:
  ```typescript
  aggregates: z.object({
    totalOutstandingMinorUnits: z.number().int(),
    countOutstanding: z.number().int(),
    totalFilteredMinorUnits: z.number().int(),
  })
  ```
  **Note:** `countFiltered` removed — it duplicates the existing `total` field in the response root.
- [ ] New repository methods:
  - `aggregateOutstanding(businessId, filters)` — sum of `totalInclVatMinorUnits` + count for status IN (`finalized`, `sent`, `partially_paid`) within filtered set (customer + date + q filters apply, status filter chip does NOT override)
  - `aggregateFiltered(filters)` — sum for entire filtered set (count already covered by existing `countInvoices`)
- [ ] Update `listInvoices` service method to run aggregate queries (parallel with `Promise.all`)
- [ ] Tests for aggregate values (repository + route)

### Frontend

- [ ] `InvoiceSummaryRow` component inserted between filters and content in the list page
- [ ] Shows: "ממתין לתשלום: ₪X,XXX (N חשבוניות)" + "סה"כ בסינון: ₪X,XXX"
- [ ] Updates when filters change (from query response)
- [ ] Test for InvoiceSummaryRow component

---

## Acceptance Criteria

- [ ] Aggregates returned correctly with all filter combinations
- [ ] Outstanding aggregate ignores the status chip filter (always counts finalized + sent + partially_paid)
- [ ] Outstanding aggregate respects customer, date, and text filters
- [ ] Summary row displays in the list page
- [ ] `npm run check` passes
- [ ] Tests for aggregate repository methods + route response
- [ ] Frontend component test for InvoiceSummaryRow

---

## Links

- Branch: claude/review-t09b-plan-tj7Ig
- PR: —
- Deployed: ⬜
