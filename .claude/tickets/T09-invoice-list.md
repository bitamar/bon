# T09 — Invoice List & Search

**Status**: 🔒 Blocked (T08 must deploy first)
**Phase**: 2 — Invoices
**Requires**: T08 deployed
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

<!-- Your notes here — e.g. filtering strategy (server-side from day one), aggregate query design, pagination approach -->

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
