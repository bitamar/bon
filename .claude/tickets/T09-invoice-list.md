# T09 — Invoice List & Search

**Status**: 🔒 Blocked (T08 must merge first)
**Phase**: 2 — Invoices
**Requires**: T08 merged
**Blocks**: T10 (PDF link in list)

---

## What & Why

The invoice list is an accountant's working environment. They live here. It must be filterable, sortable, and show summary totals for the filtered set. From day one it must be server-side paginated — don't build a list that breaks at 500 invoices.

---

## Acceptance Criteria

- [ ] `GET /businesses/:id/invoices` with query params: `status`, `customerId`, `dateFrom`, `dateTo`, `q`, `sort`, `page`, `limit`
- [ ] Response includes aggregate totals for filtered set (total outstanding, total this period)
- [ ] Filter chips in UI: כל החשבוניות | טיוטות | ממתינות לתשלום | שולמו | בוטלו
- [ ] Each row: invoice number, customer name, date, total incl. VAT, status badge
- [ ] Days overdue shown in red when > 30 days past due
- [ ] Customer filter: typeahead combobox
- [ ] Date range filter: two DatePickerInputs
- [ ] Default view: unpaid/outstanding, sorted by due date (oldest first)
- [ ] Pagination (20 per page)
- [ ] Empty state per filter (different messages for "no invoices" vs "no results for this filter")
- [ ] `npm run check` passes

---

## Architecture Notes

**`invoiceListQuerySchema`**: Define in this ticket (deferred from T06). Schema with: `status` (comma-sep), `customerId`, `documentType`, `dateFrom`, `dateTo`, `q`, `sort`, `page`, `limit`. Cap limit at 200 (same pattern as customer list).

**`isOverdue` column**: Available in schema from T06 but always `false` until T17 ships the cron job. For MVP display, consider computing overdue client-side from `dueDate` + status, or just show the column and accept it's always false until T17.

**Mixed VAT rate breakdown**: Not stored as a summary — derivable from `invoice_items` per-line `vatRate` and `vatAmountAgora`. If the list view needs a VAT breakdown per rate, compute it from items on demand.

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
