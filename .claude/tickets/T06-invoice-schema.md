# T06 — Invoice Data Model & VAT Engine

**Status**: ⬜ Next up
**Phase**: 2 — Invoices
**Requires**: T-API-01, T04, T05 (all merged)
**Blocks**: T07, T08, T09

---

## What & Why

The schema defines the legal structure of an invoice. Every design decision here has a compliance consequence:
- All amounts stored as agora (integer) — never floats for money
- VAT calculated per line then summed — matches how accountants verify
- Sequential numbering via upsert to prevent gaps or duplicates
- Customer data snapshot on finalization — the invoice must reflect who it was issued to, even if the customer record changes later

The VAT engine is a pure function — easy to test, runs in browser for live preview, recalculated server-side on finalization (client values are discarded).

**Scope**: Schema + types + VAT engine only. No API routes, no service layer, no frontend. Those belong to T07.

---

## Deliverables

1. Migration file: creates `invoices`, `invoice_items`, `invoice_sequences`; drops `businesses.nextInvoiceNumber`; adds indexes
2. Drizzle schema in `api/src/db/schema.ts`
3. Zod schemas in `types/src/invoices.ts`
4. VAT calculation functions in `types/src/vat.ts`
5. `assignInvoiceNumber()` in `api/src/lib/invoice-sequences.ts`
6. Unit tests for VAT engine
7. Concurrent load test for sequence assignment
8. Update `types/src/businesses.ts` to remove `nextInvoiceNumber`
9. Update `api/src/services/business-service.ts` to remove `nextInvoiceNumber` references
10. Update `api/tests/utils/db.ts` to include new tables in `resetDb`

---

## Acceptance Criteria

- [ ] `invoices` table created per schema below
- [ ] `invoice_items` table created per schema below
- [ ] `invoice_sequences` table created per schema below
- [ ] `businesses.nextInvoiceNumber` column dropped (replaced by `invoice_sequences`)
- [ ] `assignInvoiceNumber()` transaction function — race-condition safe via upsert
- [ ] 50 concurrent finalization requests produce 50 distinct sequential numbers (load test)
- [ ] `calculateLine()` and `calculateInvoiceTotals()` pure functions in `types/src/vat.ts`
- [ ] Unit tests for VAT engine covering: whole amounts, fractional quantities, discount combos, 0% VAT, 100% discount, rounding edge cases
- [ ] Zod schemas for invoice create/update/response in `types/src/invoices.ts`
- [ ] Drizzle migration generated and tested
- [ ] `npm run check` passes

---

## Schema Design (Resolved Decisions)

### New Enums

```
documentTypeEnum: tax_invoice, tax_invoice_receipt, receipt, credit_note
  — Maps to ITA codes: 305, 320, 400, 330

invoiceStatusEnum: draft, finalized, sent, paid, partially_paid, cancelled, credited
  — `credited` included from day one (legally distinct from cancelled)

allocationStatusEnum: pending, approved, rejected, emergency
  — NULL = not applicable / not requested (no `none` value)
```

### `invoices` Table

```
id                    uuid PK
businessId            uuid FK → businesses (NOT NULL)
customerId            uuid FK → customers (nullable — not set yet for drafts, customer may be deleted later)

-- Snapshot of customer at time of finalization (all nullable for draft state)
customerName          text (nullable — set on finalization)
customerTaxId         text (nullable)
customerAddress       text (nullable)

-- Document identity (nullable for draft state)
documentType          documentTypeEnum NOT NULL (set at draft creation)
sequenceNumber        integer (nullable — assigned on finalization)
fullNumber            text (nullable — assigned on finalization)

-- Dates
invoiceDate           date NOT NULL (defaults to today at draft creation)
issuedAt              timestamp with tz (nullable — system-set on finalization)
dueDate               date (nullable — optional)

-- Amounts (all nullable for draft state, in agora = 1/100 shekel)
subtotalAgora         integer (nullable)
discountAgora         integer (nullable)
totalExclVatAgora     integer (nullable)
vatAgora              integer (nullable)
totalInclVatAgora     integer (nullable)

-- Status
status                invoiceStatusEnum NOT NULL DEFAULT 'draft'
isOverdue             boolean NOT NULL DEFAULT false

-- SHAAM (nullable = not applicable)
allocationNumber      text (nullable)
allocationStatus      allocationStatusEnum (nullable)
allocationError       text (nullable)

-- Credit note
creditedInvoiceId     uuid FK → invoices (nullable — only for credit notes, must be same businessId)

-- Metadata
currency              text NOT NULL DEFAULT 'ILS' (forward-compat; MVP enforces ILS-only)
vatExemptionReason    text (nullable — required on finalization when vatAgora=0 and business is not exempt)
notes                 text (nullable — appears on invoice)
internalNotes         text (nullable — internal only)
sentAt                timestamp with tz (nullable — first sent timestamp)
paidAt                timestamp with tz (nullable — set when status → paid)

createdAt             timestamp with tz NOT NULL DEFAULT now()
updatedAt             timestamp with tz NOT NULL DEFAULT now()

-- Constraints
UNIQUE (businessId, documentType, sequenceNumber) WHERE sequenceNumber IS NOT NULL
  — Partial unique index: only enforced for finalized invoices that have a number

-- Indexes
(businessId, status)
(businessId, invoiceDate)
(businessId, customerId)
(businessId, documentType)
```

### `invoice_items` Table

```
id                uuid PK
invoiceId         uuid FK → invoices (cascade delete) NOT NULL
position          integer NOT NULL (display order, gaps allowed)
description       text NOT NULL
quantity          numeric(12,4) NOT NULL (supports fractional units, e.g. 2.5 hours)
unitPriceAgora    integer NOT NULL (in agora)
discountPercent   numeric(5,2) NOT NULL DEFAULT 0 (0-100)
lineTotalAgora    integer NOT NULL (after discount, before VAT)
vatRate           integer NOT NULL (basis points, e.g. 1700 = 17%)
vatAmountAgora    integer NOT NULL (calculated, rounded per line)
catalogNumber     text (nullable — optional, for SHAAM Table 2.2 ItemId, max 50 chars)

-- Constraints
UNIQUE (invoiceId, position)
```

**Note on `numeric` columns**: Drizzle returns `string` for `numeric` types. The service layer must parse with `Number()` when building API responses.

### `invoice_sequences` Table

```
businessId        uuid FK → businesses NOT NULL
documentType      documentTypeEnum NOT NULL
nextNumber        integer NOT NULL DEFAULT 1

PRIMARY KEY (businessId, documentType)
```

### Fields Removed from `invoices` (vs. PLAN.md §2.1)

| Field | Reason |
|-------|--------|
| `paymentMethod` | Lives exclusively on `invoice_payments` (T15). No good answer for "which method?" when there are 3 partial payments. |
| `paymentReference` | Same — belongs on `invoice_payments`. |
| `paidAmount` | Derived from SUM of `invoice_payments.amountAgora`. Denormalized field would go stale. |

### Fields Added (vs. PLAN.md §2.1)

| Field | Reason |
|-------|--------|
| `isOverdue` | Overdue is a temporal attribute, not a lifecycle state. A paid invoice *was* overdue. |
| `currency` | Forward-compat. `DEFAULT 'ILS'`, MVP enforces ILS-only. Avoids painful ALTER on immutable finalized rows later. |
| `vatExemptionReason` | Legal compliance: when a non-exempt business issues 0% VAT invoice, Israeli law requires stating the reason (e.g. export services §30(a)(5)). |
| `credited` in status enum | Legally distinct from `cancelled`. Credit note (330) is a formal reversal; cancellation is an error correction. |

---

## Status Machine

```
draft          → finalized     (POST .../finalize)
draft          → [hard delete] (DELETE — drafts only)
finalized      → sent          (POST .../send — T11)
finalized      → paid          (POST .../payments — T15, full payment)
finalized      → partially_paid (POST .../payments — T15, partial)
finalized      → credited      (credit note issued — T16)
finalized      → cancelled     (invoice issued in error, never fulfilled)
sent           → paid
sent           → partially_paid
sent           → credited
sent           → cancelled     (rare — sent but never fulfilled)
partially_paid → paid          (remaining balance paid)
partially_paid → credited      (credit note for remaining)
paid           → [terminal]
credited       → [terminal]
cancelled      → [terminal]
```

**Forbidden transitions (must be explicitly blocked):**
- `finalized → draft` (no un-finalizing)
- `paid → cancelled` (must issue credit note + refund)
- `credited → cancelled`

---

## Sequence Numbering

### Prefix Logic

| Document Type | Sequence | Prefix |
|---------------|----------|--------|
| tax_invoice (305) | Shared with 320 | `business.invoiceNumberPrefix` (e.g. "INV") |
| tax_invoice_receipt (320) | Shared with 305 | `business.invoiceNumberPrefix` |
| credit_note (330) | Separate | `"ז"` (fixed) |
| receipt (400) | Separate | `"ק"` (fixed) |

**⚠️ Legal flag**: 305+320 sharing a sequence is standard practice (Greeninvoice, iCount, Rivhit all do this), but must be confirmed with accountant before shipping. See T-LEGAL-01.

### Seeding

- Types 305/320: seed from `business.startingInvoiceNumber`
- Types 330/400: always seed from 1

### Format

`{prefix}-{padded_number}` → e.g. `INV-0042`, `ז-0001`
If no prefix: just the padded number → `0042`

### Gap Policy

Sequence number gaps from rolled-back transactions are acceptable. Gaps must NOT trigger retries or reuse. What is NOT acceptable is two invoices with the same number.

---

## VAT Calculation Engine

Location: `types/src/vat.ts`

```
// Pure functions — no dependencies, works in browser and server

interface LineItemInput {
  quantity: number;           // e.g. 2.5
  unitPriceAgora: number;     // e.g. 10000 (= ₪100)
  discountPercent: number;    // e.g. 10 (= 10%)
  vatRateBasisPoints: number; // e.g. 1700 (= 17%)
}

interface LineItemResult {
  lineTotalAgora: number;         // after discount, before VAT
  vatAmountAgora: number;         // rounded per line
  lineTotalInclVatAgora: number;  // lineTotal + VAT
}

interface InvoiceTotals {
  subtotalAgora: number;       // sum of line gross amounts (before discount)
  discountAgora: number;       // sum of line discounts
  totalExclVatAgora: number;   // sum of lineTotals
  vatAgora: number;            // sum of vatAmounts
  totalInclVatAgora: number;   // totalExclVat + vat
}

function calculateLine(item: LineItemInput): LineItemResult
function calculateInvoiceTotals(items: LineItemInput[]): InvoiceTotals
```

**Rounding**: `Math.round` (standard rounding). Israel uses standard rounding for tax calculations.

**VAT per line, then sum**: This matches how Israeli accountants verify — they check each line independently. The sum of per-line VAT may differ from "VAT on subtotal" by a few agora due to rounding. Per-line is the legally correct method.

### Server-Side Validation on Finalization

- If `businessType = exempt_dealer`: all line item `vatRate` must be `0`. Reject with 422 otherwise.
- If `businessType != exempt_dealer`: `vatRate` must be `0` or `1700` (current standard rate). Other values rejected.
- All amounts recalculated from inputs. Client-submitted totals are discarded.

### `invoiceDate` Validation

- Zod validates it's a valid ISO date string
- Service layer enforces business rules: warn (not block) if > 30 days in the past, reject if > 7 days in future
- Exact backdating window needs accountant confirmation (see T-LEGAL-01)

---

## Zod Schemas (`types/src/invoices.ts`)

### Core Schemas

```
documentTypeSchema       — z.enum(['tax_invoice', 'tax_invoice_receipt', 'receipt', 'credit_note'])
invoiceStatusSchema      — z.enum(['draft', 'finalized', ...all 7])
allocationStatusSchema   — z.enum(['pending', 'approved', 'rejected', 'emergency'])
```

### Request Schemas

```
createInvoiceDraftBodySchema:
  documentType        required (defaults to tax_invoice in UI, but required in API)
  invoiceDate         optional (defaults to today server-side)
  customerId          optional (can be set later)
  dueDate             optional
  notes               optional
  internalNotes       optional
  items               optional array of:
    description       required
    quantity          required, positive number
    unitPriceAgora    required, non-negative integer
    discountPercent   optional, 0-100
    vatRateBasisPoints required, non-negative integer
    catalogNumber     optional
    position          required, non-negative integer

updateInvoiceDraftBodySchema:
  — All fields from create, but all optional
  — If `items` is present, replaces all existing items (delete + insert)

finalizeInvoiceBodySchema:
  — Empty or optional overrides (e.g. invoiceDate adjustment)
  — Finalization is mostly a server-side operation
```

### Response Schemas

```
invoiceItemSchema        — full item with id, all calculated fields
invoiceSchema            — full invoice with all fields
invoiceResponseSchema    — { invoice, items[] }
invoiceListItemSchema    — id, fullNumber, customerName, documentType, invoiceDate, totalInclVatAgora, status, isOverdue
invoiceListResponseSchema — { invoices[], total }
```

### Param/Query Schemas

```
invoiceParamSchema       — { businessId }
invoiceIdParamSchema     — { businessId, invoiceId }
invoiceListQuerySchema   — status, customerId, documentType, dateFrom, dateTo, q, sort, page, limit
```

---

## pg-mem Compatibility

All features verified compatible:
- `numeric(12,4)` columns ✅
- `date` columns ✅
- New pgEnum definitions ✅
- Partial unique index (`WHERE col IS NOT NULL`) ✅
- Composite primary key ✅
- Upsert with `ON CONFLICT DO UPDATE ... RETURNING` ✅
- `db.transaction()` ✅

No workarounds needed.

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
