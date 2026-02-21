# T07 — Invoice API + Create/Edit UI (Draft)

**Status**: 🔒 Blocked (T06 must deploy first)
**Phase**: 2 — Invoices
**Requires**: T06 deployed
**Blocks**: T08

---

## What & Why

This is the heart of the product. A user who knows what they're billing should be done in under 60 seconds. The draft is saved immediately on page load — the user never loses work.

T07 owns the full API layer (routes, service, repository) for invoice CRUD + draft management, plus the frontend create/edit UI. T06 provides the schema and types; T07 builds on top.

**Recommended PR split** (each ≤10 files):
1. **PR 1**: Repository + service layer + unit tests
2. **PR 2**: Routes + integration tests
3. **PR 3**: Frontend create/edit UI + form tests

---

## API Endpoints

All routes prefixed with `/businesses/:businessId`, requiring `app.authenticate` + `app.requireBusinessAccess`.

| Method | Path | Description | Status Code |
|--------|------|-------------|-------------|
| `POST` | `/invoices` | Create a new draft | 201 |
| `GET` | `/invoices` | List invoices (paginated, filterable) | 200 |
| `GET` | `/invoices/:invoiceId` | Get invoice with items | 200 |
| `PATCH` | `/invoices/:invoiceId` | Update a draft (including items) | 200 |
| `DELETE` | `/invoices/:invoiceId` | Delete a draft (only drafts) | 200 |
| `POST` | `/invoices/:invoiceId/finalize` | Finalize a draft | 200 |

### Key API Behaviors

**Create Draft** (`POST`):
- Creates invoice with `status = 'draft'`
- `invoiceDate` defaults to today if not provided
- Validates `customerId` exists in this business if provided
- If `items` provided, creates them and calculates totals
- Returns full invoice with items

**Update Draft** (`PATCH`):
- Only drafts can be updated — return 409 if not a draft
- If `items` is present, **replaces all existing items** (delete + insert)
- Recalculates all amount fields from items
- Returns updated invoice with items

**Delete Draft** (`DELETE`):
- Only drafts can be deleted — return 409 if not a draft
- Hard delete (with cascade to items)

**Finalize** (`POST .../finalize`):
- Validates: must be a draft, must have customer, must have ≥1 line item, all amounts > 0
- In a single transaction: assign sequence number, snapshot customer, set `issuedAt`, recalculate totals, set `status = 'finalized'`
- Server recalculates all amounts — client values discarded
- Returns finalized invoice

**List** (`GET`):
- Paginated with `page` + `limit`
- Filters: `status` (comma-sep), `customerId`, `documentType`, `dateFrom`, `dateTo`, `q` (searches customerName, fullNumber, notes)
- Returns `{ invoices[], total }`

---

## Frontend UI Acceptance Criteria

- [ ] `POST /businesses/:id/invoices` creates a draft immediately on page load
- [ ] Customer search: combobox, shows name + taxId + city, instant search
- [ ] Document type selector with tooltip explanations (חשבונית מס, חשבונית מס קבלה, קבלה)
- [ ] Date picker (DatePickerInput, defaults to today)
- [ ] Line items table:
  - [ ] Tab navigation: description → quantity → unit price → discount → next row
  - [ ] Enter on last field of row adds new row
  - [ ] Backspace on empty description of last row deletes the row
  - [ ] VAT amount shown per line (calculated via `calculateLine()` from `@bon/types/vat`)
  - [ ] Live totals update as user types (via `calculateInvoiceTotals()`)
- [ ] "שמור טיוטה" saves without finalizing
- [ ] Invoice persists on browser refresh (saved to DB as draft)
- [ ] "בטל טיוטה" confirm modal → deletes draft
- [ ] Loading, error, empty states on customer search
- [ ] `npm run check` passes

---

## API Acceptance Criteria

- [ ] All 6 endpoints implemented with correct Zod schemas from T06
- [ ] Every route has tests: happy path + one validation/error case
- [ ] Draft CRUD: create, read, update (with item replacement), delete
- [ ] Finalize: assigns sequence number, snapshots customer, recalculates amounts
- [ ] Finalize rejects: missing customer, no items, non-draft status
- [ ] List: pagination, status filter, customer filter, free-text search
- [ ] Multi-tenant isolation: cannot access another business's invoices
- [ ] `npm run check` passes

---

## Architecture Notes

**Autosave strategy**: Debounced PATCH on change (500ms). The draft is the server's copy — browser state is local until saved. On page load, if a draft exists for this route, load it. Otherwise create a new one.

**Line item state**: Managed locally in React state for responsiveness. Synced to server on save (PATCH with full `items[]` array). No per-item API calls.

**VAT preview**: Uses `calculateLine()` and `calculateInvoiceTotals()` from `@bon/types/vat` directly in the browser. Same pure functions the server uses.

**Customer search**: Reuses the existing customer list endpoint with `?q=` parameter. Combobox with debounced search (150ms).

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
