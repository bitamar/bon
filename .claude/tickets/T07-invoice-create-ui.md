# T07 — Invoice API + Create/Edit UI (Draft)

**Status**: 🔒 Blocked (T06 must merge first)
**Phase**: 2 — Invoices
**Requires**: T06 merged
**Blocks**: T08

---

## What & Why

This is the heart of the product. A user who knows what they're billing should be done in under 60 seconds. The draft is saved immediately on page load — the user never loses work.

T07 owns the full API layer (routes, service, repository) for invoice CRUD + draft management, the finalize API endpoint, plus the frontend create/edit UI. T06 provides the schema and types; T07 builds on top.

**Scope boundary with T08**: T07 builds the finalize **API endpoint** (route, service logic, repository). T08 builds the **frontend finalization flow** (preview modal, business profile completeness gate, confirmation UX) and the **invoice detail view page**. In T07, the "הפק חשבונית" button calls the finalize API directly with no preview modal — the preview modal is T08's work.

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
| `GET` | `/invoices/:invoiceId` | Get invoice with items | 200 |
| `PATCH` | `/invoices/:invoiceId` | Update a draft (including items) | 200 |
| `DELETE` | `/invoices/:invoiceId` | Delete a draft (only drafts) | 200 |
| `POST` | `/invoices/:invoiceId/finalize` | Finalize a draft | 200 |

**Note**: The full list endpoint (`GET /invoices` with pagination, filters, search) belongs to T09. T07 does NOT build the list endpoint.

### Key API Behaviors

**Create Draft** (`POST`):
- Creates invoice with `status = 'draft'`
- `documentType` required — must be `tax_invoice` or `tax_invoice_receipt` (reject `receipt` and `credit_note` — receipts need payment context from T15, credit notes are created by a separate flow in T16)
- `invoiceDate` defaults to today if not provided
- Validates `customerId` exists in this business and is active if provided
- If `items` provided, calculates totals via VAT engine and stores calculated amounts
- Returns full invoice with items

**Update Draft** (`PATCH`):
- Only drafts can be updated — return 422 if not a draft (with error code `not_draft`)
- If `items` is present, **replaces all existing items** (delete + insert) — inside a transaction
- Recalculates all amount fields from items via VAT engine
- If `customerId` provided, validates it exists in this business and is active
- Returns updated invoice with items

**Delete Draft** (`DELETE`):
- Only drafts can be deleted — return 422 if not a draft (with error code `not_draft`)
- Hard delete (with cascade to items)

**Finalize** (`POST .../finalize`):
- Validates: must be a draft, must have customer (exists and active), must have ≥1 line item
- VAT rate validation: exempt_dealer business → all line item rates must be 0; non-exempt → rates must be 0 or 1700
- `invoiceDate` validation: reject if > 7 days in the future (past dates allowed — warn behavior deferred to T-LEGAL-01 resolution)
- In a single transaction: assign sequence number, snapshot customer fields, set `issuedAt = now()`, recalculate all totals, set `status = 'finalized'`
- Server recalculates all amounts — client values discarded
- Returns finalized invoice with items

### Error Codes

| Endpoint | Error | Status | Code |
|----------|-------|--------|------|
| PATCH, DELETE | Invoice is not a draft | 422 | `not_draft` |
| POST, PATCH | `customerId` not found in this business | 422 | `customer_not_found` |
| POST, PATCH | `customerId` references inactive customer | 422 | `customer_inactive` |
| POST | `documentType` is `receipt` or `credit_note` | 422 | `invalid_document_type` |
| Finalize | Invoice is not a draft | 422 | `not_draft` |
| Finalize | No customer set | 422 | `missing_customer` |
| Finalize | No line items | 422 | `no_line_items` |
| Finalize | Invalid VAT rate for business type | 422 | `invalid_vat_rate` |
| Finalize | `invoiceDate` > 7 days in future | 422 | `invalid_invoice_date` |
| Finalize | Customer is inactive | 422 | `customer_inactive` |
| All | Invoice not found / wrong business | 404 | `not_found` |
| All | Not authenticated | 401 | — |
| All | Not a business member | 404 | — |

---

## Repository Layer

File: `api/src/repositories/invoice-repository.ts`

Invoice items are in the same file (tightly coupled — never accessed independently).

**Transaction pattern**: All repository methods accept an optional `txOrDb` parameter (defaulting to `db`) so the service layer can wrap multiple operations in a single transaction. This is a new pattern for the codebase — existing repos don't accept `tx`. T07 introduces it because finalization requires atomic sequence assignment + invoice update + item recalculation.

```
type TxOrDb = NodePgDatabase<typeof schema>;

// Invoice CRUD
insertInvoice(data: InvoiceInsert, txOrDb?: TxOrDb): Promise<InvoiceRecord | null>
findInvoiceById(invoiceId: string, businessId: string, txOrDb?: TxOrDb): Promise<InvoiceRecord | null>
findInvoiceWithItems(invoiceId: string, businessId: string, txOrDb?: TxOrDb): Promise<{ invoice: InvoiceRecord; items: InvoiceItemRecord[] } | null>
updateInvoice(invoiceId: string, businessId: string, updates: Partial<InvoiceUpdate>, txOrDb?: TxOrDb): Promise<InvoiceRecord | null>
deleteInvoice(invoiceId: string, businessId: string, txOrDb?: TxOrDb): Promise<boolean>

// Item operations
insertItems(items: InvoiceItemInsert[], txOrDb?: TxOrDb): Promise<InvoiceItemRecord[]>
deleteItemsByInvoiceId(invoiceId: string, txOrDb?: TxOrDb): Promise<void>
findItemsByInvoiceId(invoiceId: string, txOrDb?: TxOrDb): Promise<InvoiceItemRecord[]>
```

**`numeric` column handling**: Drizzle returns `string` for `quantity` and `discountPercent`. Conversion to `Number()` happens in the service layer serializer (like the existing `serializeCustomer` pattern), NOT in the repository.

---

## Service Layer

File: `api/src/services/invoice-service.ts`

```
createDraft(businessId: string, input: CreateInvoiceDraftBody): Promise<InvoiceResponse>
getInvoice(businessId: string, invoiceId: string): Promise<InvoiceResponse>
updateDraft(businessId: string, invoiceId: string, input: UpdateInvoiceDraftBody): Promise<InvoiceResponse>
deleteDraft(businessId: string, invoiceId: string): Promise<void>
finalize(businessId: string, invoiceId: string): Promise<InvoiceResponse>
```

**Serializer functions**: `serializeInvoice(record)` and `serializeInvoiceItem(record)` convert DB records to API DTOs, including `Number()` conversion for numeric columns. Follow the `serializeCustomer` pattern.

**Transaction ownership**: The service layer owns transactions. For operations that span multiple repository calls:
- `updateDraft` with items: `db.transaction(async (tx) => { deleteItems + insertItems + updateInvoice })`
- `finalize`: `db.transaction(async (tx) => { loadInvoice + loadCustomer + assignInvoiceNumber + updateInvoice })`

**Business record loading during finalization**: The service must load the business record to get:
- `invoiceNumberPrefix` → for sequence number formatting
- `startingInvoiceNumber` → for lazy seeding of `tax_document` sequence
- `businessType` → for VAT rate validation (exempt_dealer check)

Load the business record before entering the transaction (these fields are set at business creation and rarely change).

**Prefix mapping for sequence numbering**:

```typescript
function getDocumentPrefix(documentType: DocumentType, business: BusinessRecord): string {
  switch (documentType) {
    case 'tax_invoice':
    case 'tax_invoice_receipt':
      return business.invoiceNumberPrefix ?? '';
    case 'credit_note':
      return 'ז';
    case 'receipt':
      return 'ק';
  }
}
```

### Validation Partitioning

**Draft create/update (permissive)**:
- `documentType` must be `tax_invoice` or `tax_invoice_receipt`
- `customerId` optional — if provided, validate it belongs to this business and `isActive`
- `items` optional — if provided, calculate totals via VAT engine
- No VAT rate validation, no amount validation
- `invoiceDate` if provided must be a valid date (Zod handles this)

**Finalization (strict)**:
- Must be a draft
- `customerId` required, exists, same business, `isActive`
- At least 1 line item
- VAT rate validation: exempt_dealer → all rates 0; non-exempt → rates 0 or 1700
- `invoiceDate` must not be > 7 days in the future
- Server recalculates all amounts (client values discarded)

---

## Frontend Architecture

### Page Components

Two separate pages:

1. **`InvoiceCreate`** (`/business/invoices/new`) — thin page that:
   - Calls `POST /invoices` with `{ documentType: 'tax_invoice' }` on mount
   - Seeds query cache with the returned draft
   - Redirects to `/business/invoices/:id/edit`

2. **`InvoiceEdit`** (`/business/invoices/:invoiceId/edit`) — full form page

### Component Tree

```
InvoiceEdit (page)
  |-- PageTitle + StatusBadge ("טיוטה")
  |-- SaveStateIndicator ("נשמר" / "שומר..." / "שגיאה בשמירה")
  |-- CustomerCombobox
  |   |-- Uses existing customer list endpoint with debounced ?q= (150ms)
  |   |-- Shows name, taxId, city per result
  |   |-- First option: "לקוח חדש" → quick-create modal (name + taxId only)
  |   |-- After quick-create: auto-select new customer, invalidate customer query cache
  |-- InvoiceMetaFields
  |   |-- DocumentTypeSelect (Select with tooltips, only tax_invoice + tax_invoice_receipt)
  |   |-- DatePickerInput (invoiceDate, defaults to today)
  |   |-- DatePickerInput (dueDate, optional)
  |-- LineItemsTable
  |   |-- LineItemRow (one per item)
  |   |   |-- TextInput (description, maxLength=255)
  |   |   |-- NumberInput (quantity, min=0.0001, decimalScale=4)
  |   |   |-- NumberInput (unitPriceAgora, formatted as ₪ currency)
  |   |   |-- NumberInput (discountPercent, suffix="%", min=0, max=100)
  |   |   |-- Text (calculated line total, read-only)
  |   |   |-- Text (calculated VAT amount, read-only)
  |   |   |-- ActionIcon (delete row)
  |   |-- AddLineButton ("+ הוסף שורה")
  |-- InvoiceTotalsSummary
  |   |-- Subtotal (סכום)
  |   |-- Discount (הנחה)
  |   |-- Total excl. VAT (סה"כ לפני מע"מ)
  |   |-- VAT amount with rate (מע"מ 17%)
  |   |-- Total incl. VAT (סה"כ לתשלום) — bold/prominent
  |-- Textarea (notes, "הערות — יופיעו על גבי החשבונית")
  |-- Textarea (internalNotes, "הערות פנימיות — לא יופיעו בחשבונית", gray background)
  |-- ActionBar
      |-- Button "שמור טיוטה" (manual save trigger)
      |-- Button "בטל טיוטה" (delete draft, confirmation modal)
      |-- Button "הפק חשבונית" (calls finalize API directly — no preview modal, that's T08)
```

### State Management

Use Mantine `useForm` for all fields including items as a nested array (`form.values.items`). Watch `form.values` changes with `useEffect` to trigger autosave debounce and live VAT recalculation.

**VAT rate source for new line items**: Fetch the business record via `GET /businesses/:businessId` (existing endpoint, returns `defaultVatRate`). Pre-populate `vatRateBasisPoints` on new line items from this value.

### Autosave State Machine

```
States: idle | saving | saved | error
Transitions:
  idle → saving:   user changes any field (debounce 500ms starts)
  saving → saved:  PATCH returns 200
  saving → error:  PATCH returns any error
  error → saving:  user changes any field OR user clicks retry
  saved → saving:  user changes any field

Display: SaveStateIndicator component shows:
  idle/saved: "נשמר ✓" (subtle)
  saving: "שומר..." with spinner
  error: "שגיאה בשמירה — לחצו לנסות שוב" (inline banner, not blocking)

Navigation guard: if state is "saving" or form has unsaved changes, show browser beforeunload confirmation dialog.

Race condition safety: since PATCH sends the full current state (all fields + full items array), last-write-wins is safe. The latest state always has all the latest data.

Max save interval: force-save every 10 seconds even during continuous typing (prevents data loss on browser crash during extended editing sessions).
```

### Customer Quick-Create Flow

When the user selects "לקוח חדש" from the customer combobox:
1. Modal opens with: name (required) + taxId (optional) fields only
2. On submit: `POST /businesses/:businessId/customers` with minimal data
3. On success: close modal, auto-select the new customer in the combobox, trigger autosave to PATCH the draft with `customerId`
4. On duplicate taxId error (409): show the existing customer name and offer to select it instead
5. Invalidate the customer list query cache so subsequent searches include the new customer

---

## Deliverables Checklist

- [ ] `api/src/repositories/invoice-repository.ts` — all repository methods with `txOrDb` pattern
- [ ] `api/src/services/invoice-service.ts` — all service methods with serializers
- [ ] `api/src/routes/invoices.ts` — all 5 route handlers
- [ ] Register `invoiceRoutes` in `api/src/app.ts`
- [ ] Add `getDocumentPrefix()` utility (in `api/src/lib/invoice-sequences.ts` or service)
- [ ] `front/src/api/invoices.ts` — API client functions (following `customers.ts` pattern)
- [ ] Add query keys to `front/src/lib/queryKeys.ts`: `invoices(businessId)`, `invoice(businessId, invoiceId)`
- [ ] `front/src/pages/InvoiceCreate.tsx` — thin create-and-redirect page
- [ ] `front/src/pages/InvoiceEdit.tsx` — full form page with all components
- [ ] Route registrations in frontend router

---

## Frontend UI Acceptance Criteria

- [ ] `/business/invoices/new` creates a draft via POST and redirects to edit page
- [ ] `/business/invoices/:id/edit` loads an existing draft
- [ ] Customer search: combobox using existing customer list endpoint, shows name + taxId + city
- [ ] Customer quick-create: "לקוח חדש" opens modal → on success auto-selects the new customer
- [ ] Document type selector: `Select` with only `tax_invoice` and `tax_invoice_receipt` options, each with tooltip explanation
- [ ] Date picker: `DatePickerInput` for `invoiceDate` (defaults to today) and `dueDate` (optional)
- [ ] Line items table:
  - [ ] Tab navigation: description → quantity → unit price → discount → next row
  - [ ] Enter on last field of row adds new row
  - [ ] Backspace on empty description of last row deletes the row
  - [ ] VAT amount shown per line (calculated via `calculateLine()` from `@bon/types/vat`)
  - [ ] Live totals update as user types (via `calculateInvoiceTotals()`)
  - [ ] New line items pre-populated with business `defaultVatRate`
  - [ ] `description` field: `maxLength={255}`
- [ ] Notes textarea: "הערות" (appears on invoice)
- [ ] Internal notes textarea: "הערות פנימיות" with gray background (does not appear on invoice)
- [ ] Save state indicator: shows "נשמר" / "שומר..." / "שגיאה בשמירה"
- [ ] Autosave: debounced 500ms on any change, forced every 10s during continuous editing
- [ ] Failed autosave shows inline error banner with retry option
- [ ] "שמור טיוטה" button manually triggers save
- [ ] "בטל טיוטה" button shows confirmation modal → deletes draft via DELETE
- [ ] "הפק חשבונית" button calls finalize API directly (no preview modal — that's T08)
- [ ] Browser beforeunload dialog when navigating away with unsaved changes
- [ ] Loading, error, empty states on customer search and invoice load
- [ ] `npm run check` passes

---

## API Acceptance Criteria

- [ ] 5 endpoints implemented with correct Zod schemas from T06
- [ ] Every route has tests: happy path + one validation/error case
- [ ] Draft CRUD: create, read, update (with item replacement), delete
- [ ] Create rejects `documentType: 'receipt'` and `'credit_note'` with 422
- [ ] Update/delete reject non-draft invoices with 422 (code: `not_draft`)
- [ ] `customerId` validation: must exist in business, must be active (422 if inactive)
- [ ] Finalize: assigns sequence number, snapshots customer (name, taxId, address, email), recalculates all amounts, sets `issuedAt`
- [ ] Finalize rejects: missing customer, no items, non-draft status, invalid VAT rate, inactive customer, future date > 7 days
- [ ] Multi-tenant isolation: cannot access another business's invoices (404)
- [ ] Registered in `app.ts`
- [ ] `npm run check` passes

---

## Architecture Notes

**Autosave strategy**: Debounced PATCH on change (500ms), forced save every 10s during continuous editing. The draft is the server's copy — browser state is local until saved. On page load for `/business/invoices/:id/edit`, load the draft. For `/business/invoices/new`, create a new draft and redirect.

**Line item state**: Managed via Mantine `useForm` with `values.items` array. Synced to server on save (PATCH with full `items[]` array). No per-item API calls.

**VAT preview**: Uses `calculateLine()` and `calculateInvoiceTotals()` from `@bon/types/vat` directly in the browser. Same pure functions the server uses. Recalculated synchronously on every form change (O(n) where n is items — sub-millisecond for <100 items). The VAT engine does NOT validate rates — it calculates for any rate. Rate validation happens server-side on finalization only.

**Customer search**: Reuses the existing customer list endpoint with `?q=` parameter. Combobox with debounced search (150ms). Reuse the existing `fetchCustomers` API function from `front/src/api/customers.ts`.

**`numeric` column handling**: `quantity` and `discountPercent` come from Drizzle as strings. Conversion to `Number()` happens in service-layer serializer functions (`serializeInvoice`, `serializeInvoiceItem`), NOT in the repository. All Zod response schemas expect numbers.

**Sequence numbering**: Handled by `assignInvoiceNumber()` from `api/src/lib/invoice-sequences.ts` (T06). Uses SELECT FOR UPDATE inside the finalization transaction. Sequences are lazily seeded on first finalization — `tax_document` seeds from `business.startingInvoiceNumber`, `credit_note`/`receipt` from 1.

**Credit notes**: Line items store positive amounts. Sign semantics on `documentType`, not amounts. `calculateLine()` works identically for all document types. Note: credit notes cannot be created as drafts in T07 — they have their own creation flow in T16.

---

## Open Product Decisions

These need human input before implementation. The implementer should NOT resolve these autonomously.

| # | Question | Default if no answer |
|---|----------|---------------------|
| 1 | Can a user have multiple simultaneous drafts? | Yes — each visit to `/new` creates a new draft. Stale drafts are cleaned up in T09 (list view allows draft deletion). |
| 2 | Should there be a maximum number of line items per invoice? | 100 (enforced server-side on create/update; SHAAM payload + PDF layout considerations) |
| 3 | Can the invoice total be zero? (e.g., fully discounted complimentary service) | Yes — `totalInclVatAgora >= 0` is valid. Only reject negative totals (which shouldn't be possible with positive inputs). |
| 4 | Should `invoiceDate` restrictions apply on draft save or only on finalization? | Only on finalization. Allow any date during drafting. |
| 5 | What happens to abandoned drafts? (user creates but never finalizes) | No auto-cleanup in T07. T09 will show drafts in the list with delete option. A future ticket can add expiry policy. |
| 6 | Should the `vatExemptionReason` field appear in the create/edit form? | Defer to T08 — it's required on finalization (when VAT=0 and business is non-exempt) but can be prompted during the finalization preview flow. |

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
