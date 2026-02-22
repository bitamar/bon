# T06 — Invoice Data Model & VAT Engine

**Status**: ✅ Merged
**Phase**: 2 — Invoices
**Requires**: T-API-01, T04, T05 (all merged)
**Blocks**: T07, T08, T09

---

## What & Why

The schema defines the legal structure of an invoice. Every design decision here has a compliance consequence:
- All amounts stored as agora (integer) — never floats for money
- VAT calculated per line then summed — matches how accountants verify
- Sequential numbering via SELECT FOR UPDATE to prevent gaps or duplicates
- Customer data snapshot on finalization — the invoice must reflect who it was issued to, even if the customer record changes later

The VAT engine is a pure function — easy to test, runs in browser for live preview, recalculated server-side on finalization (client values are discarded).

**Scope**: Schema + types + VAT engine only. No API routes, no service layer, no frontend. Those belong to T07.

---

## Deliverables

1. Migration file: creates `invoices`, `invoice_items`, `invoice_sequences`; drops `businesses.nextInvoiceNumber`; adds indexes
2. Drizzle schema in `api/src/db/schema.ts`
3. Zod schemas in `types/src/invoices.ts` (request/response schemas only — defer `invoiceListQuerySchema` to T09)
4. VAT calculation Zod schemas + pure functions in `types/src/vat.ts`
5. `assignInvoiceNumber()` in `api/src/lib/invoice-sequences.ts`
6. Unit tests for VAT engine
7. Concurrent load test for sequence assignment (runs against real Postgres on port 5433)
8. Update `types/src/businesses.ts` to remove `nextInvoiceNumber`
9. Update `api/src/services/business-service.ts` to remove `nextInvoiceNumber` references
10. Update `api/tests/utils/db.ts` to include new tables in `resetDb`

---

## Acceptance Criteria

- [ ] `invoices` table created per schema below
- [ ] `invoice_items` table created per schema below
- [ ] `invoice_sequences` table created per schema below
- [ ] `businesses.nextInvoiceNumber` column dropped (replaced by `invoice_sequences`)
- [ ] `assignInvoiceNumber()` transaction function — race-condition safe via SELECT FOR UPDATE
- [ ] 50 concurrent finalization requests produce 50 distinct sequential numbers (integration test against real PG)
- [ ] `calculateLine()` and `calculateInvoiceTotals()` pure functions in `types/src/vat.ts` (exported as Zod-inferred types)
- [ ] Unit tests for VAT engine covering: whole amounts, fractional quantities, discount combos, 0% VAT, 100% discount, rounding edge cases
- [ ] Zod schemas for invoice create/update/response in `types/src/invoices.ts`
- [ ] Drizzle migration generated and tested
- [ ] `npm run check` passes

---

## Resolved Design Decisions

These questions were raised during product/architect review and resolved before implementation.

| # | Decision | Resolution |
|---|----------|------------|
| 1 | Sequence approach: upsert vs SELECT FOR UPDATE | **SELECT FOR UPDATE + UPDATE RETURNING** inside the finalization transaction. Clearer, auditable, compliance-critical code. |
| 2 | Shared sequence for 305+320: how to model | **`sequenceGroup` enum** (`tax_document`, `credit_note`, `receipt`). PK is `(businessId, sequenceGroup)`. Both 305 and 320 map to `tax_document`. |
| 3 | When are sequences seeded? | **Lazy, on first finalization.** If no row exists, insert with `startingInvoiceNumber` for `tax_document`, or `1` for `credit_note`/`receipt`. Avoids backfill migration and unused rows. |
| 4 | Credit note sign convention | **Positive amounts on line items.** Sign applied at document level. Avoids `Math.round(-0.5) → 0` JS rounding bug. `calculateLine()` works identically for invoices and credit notes. |
| 5 | `numeric` column wire format | **Convert to `number` in service layer.** Entire codebase uses numbers in Zod schemas. Parse with `Number()` in repository/response mapper. Add comment explaining why. |
| 6 | `customerId` ON DELETE behavior | **SET NULL.** Customer data is snapshotted on finalization. FK only useful for drafts and "find invoices by customer" queries. RESTRICT would block customer deletion. |
| 7 | Concurrency test | **Real Postgres on port 5433.** Separate integration test file (`invoice-sequences.integration.test.ts`). pg-mem can't test row-level locking. Skip flag for CI if needed. |
| 8 | `fullNumber` padding width | **Floor of 4 digits, grows naturally.** `padStart(4, '0')` — `INV-0042`, `INV-10000`. No truncation. ITA cares about uniqueness, not padding. |
| 9 | Can paid invoices be credited? | **Yes.** This is how refunds work in Israeli invoicing. Added `paid → credited` to status machine. |
| 10 | `isOverdue` stored vs computed | **Keep in schema.** Trivial column, one line in migration. T07 response types are correct from day one. T17 cron will maintain it. |
| 11 | Customer email snapshot | **Added `customerEmail` text nullable.** T11 needs it for delivery records. Must reflect email at time of finalization. |
| 12 | Mixed-rate VAT breakdown | **Defer.** Derivable from line items. No denormalized JSON column. T12 (SHAAM) or T09 (invoice view) can compute it. |
| 13 | Receipt (type 400) | **Include in schema/enum**, no receipt-specific logic. Removing an enum value later is harder than leaving one unused. |
| 14 | `invoiceListQuerySchema` | **Defer to T09.** Belongs with the list endpoint, not the schema ticket. |
| 15 | VAT engine types | **Zod schemas** following existing convention. Export inferred TS types via `z.infer<>`. |
| 16 | `allocationError` format | **Unconstrained text.** Defer format validation to T12 when ITA error codes are known. |

---

## Schema Design

### New Enums

```
documentTypeEnum: tax_invoice, tax_invoice_receipt, receipt, credit_note
  — Maps to ITA codes: 305, 320, 400, 330

sequenceGroupEnum: tax_document, credit_note, receipt
  — Groups document types for shared sequence numbering
  — tax_invoice + tax_invoice_receipt → tax_document
  — credit_note → credit_note
  — receipt → receipt

invoiceStatusEnum: draft, finalized, sent, paid, partially_paid, cancelled, credited
  — `credited` included from day one (legally distinct from cancelled)

allocationStatusEnum: pending, approved, rejected, emergency
  — NULL = not applicable / not requested (no `none` value)
```

### `invoices` Table

```
id                    uuid PK
businessId            uuid FK → businesses (NOT NULL)
customerId            uuid FK → customers (nullable, ON DELETE SET NULL — not set yet for drafts)

-- Snapshot of customer at time of finalization (all nullable for draft state)
customerName          text (nullable — set on finalization)
customerTaxId         text (nullable)
customerAddress       text (nullable)
customerEmail         text (nullable — for T11 email delivery records)

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
allocationError       text (nullable — unconstrained, format validated in T12)

-- Credit note
creditedInvoiceId     uuid FK → invoices (nullable — only for credit notes, same businessId enforced in service layer)

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

**Note on `numeric` columns**: Drizzle returns `string` for `numeric` types. The service layer must parse with `Number()` when building API responses. Add a comment at the conversion site explaining why.

### `invoice_sequences` Table

```
businessId        uuid FK → businesses NOT NULL
sequenceGroup     sequenceGroupEnum NOT NULL

nextNumber        integer NOT NULL DEFAULT 1

PRIMARY KEY (businessId, sequenceGroup)
```

**Mapping**: `tax_invoice` and `tax_invoice_receipt` both map to `sequenceGroup = tax_document`. `credit_note` maps to `credit_note`. `receipt` maps to `receipt`.

### Fields Removed from `invoices` (vs. PLAN.md §2.1)

| Field | Reason |
|-------|--------|
| `paymentMethod` | Lives exclusively on `invoice_payments` (T15). No good answer for "which method?" when there are 3 partial payments. |
| `paymentReference` | Same — belongs on `invoice_payments`. |
| `paidAmount` | Derived from SUM of `invoice_payments.amountAgora`. Denormalized field would go stale. |

### Fields Added (vs. PLAN.md §2.1)

| Field | Reason |
|-------|--------|
| `customerEmail` | Snapshot at finalization time for T11 email delivery records. |
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
paid           → credited      (refund via credit note — legally required path)
credited       → [terminal]
cancelled      → [terminal]
```

**Forbidden transitions (must be explicitly blocked):**
- `finalized → draft` (no un-finalizing)
- `paid → cancelled` (must issue credit note, not cancel)
- `credited → cancelled`

---

## Sequence Numbering

### Approach: SELECT FOR UPDATE

```
// Inside the finalization transaction:
async function assignInvoiceNumber(
  tx: Transaction,
  businessId: string,
  documentType: DocumentType,
  prefix: string,
  seedNumber: number      // startingInvoiceNumber for tax_document, 1 for others
): Promise<{ sequenceNumber: number; fullNumber: string }> {
  const group = documentTypeToSequenceGroup(documentType);

  // Try to lock the existing row
  const [existing] = await tx
    .select()
    .from(invoiceSequences)
    .where(and(
      eq(invoiceSequences.businessId, businessId),
      eq(invoiceSequences.sequenceGroup, group),
    ))
    .for('update');

  let assignedNumber: number;

  if (existing) {
    // Increment and return current value
    const [updated] = await tx
      .update(invoiceSequences)
      .set({ nextNumber: sql`${invoiceSequences.nextNumber} + 1` })
      .where(and(
        eq(invoiceSequences.businessId, businessId),
        eq(invoiceSequences.sequenceGroup, group),
      ))
      .returning({ nextNumber: invoiceSequences.nextNumber });
    assignedNumber = updated.nextNumber - 1;
  } else {
    // First finalization for this group — seed and return seed value
    await tx.insert(invoiceSequences).values({
      businessId,
      sequenceGroup: group,
      nextNumber: seedNumber + 1,
    });
    assignedNumber = seedNumber;
  }

  const fullNumber = prefix
    ? `${prefix}-${String(assignedNumber).padStart(4, '0')}`
    : String(assignedNumber).padStart(4, '0');

  return { sequenceNumber: assignedNumber, fullNumber };
}
```

### Sequence Group Mapping

| Document Type | Sequence Group | Prefix |
|---------------|----------------|--------|
| tax_invoice (305) | `tax_document` | `business.invoiceNumberPrefix` (e.g. "INV") |
| tax_invoice_receipt (320) | `tax_document` | `business.invoiceNumberPrefix` |
| credit_note (330) | `credit_note` | `"ז"` (fixed) |
| receipt (400) | `receipt` | `"ק"` (fixed) |

**⚠️ Legal flag**: 305+320 sharing a sequence is standard practice (Greeninvoice, iCount, Rivhit all do this), but must be confirmed with accountant before shipping. See T-LEGAL-01.

### Seeding

- **Lazy, on first finalization.** No rows created at business creation time.
- `tax_document`: seed from `business.startingInvoiceNumber`
- `credit_note`, `receipt`: always seed from `1`

### Format

`{prefix}-{padded_number}` → e.g. `INV-0042`, `ז-0001`
If no prefix: just the padded number → `0042`
Padding is a floor of 4 digits — grows naturally past 9999 (e.g. `INV-10000`). No truncation.

### Gap Policy

Sequence number gaps from rolled-back transactions are acceptable. Gaps must NOT trigger retries or reuse. What is NOT acceptable is two invoices with the same number.

### Credit Notes

Credit note line items store **positive amounts**. The "this is a credit" semantics live on the `documentType`, not on the amounts. The sign is applied at the document level (display/reporting), not in the VAT engine. This avoids `Math.round(-0.5) → 0` JS rounding issues and means `calculateLine()` works identically for all document types.

---

## VAT Calculation Engine

Location: `types/src/vat.ts`

All types defined as **Zod schemas** (following existing convention), with inferred TS types exported via `z.infer<>`.

```
// Pure functions — no dependencies, works in browser and server

// Zod schemas — export inferred types via z.infer<typeof lineItemInputSchema>
lineItemInputSchema:
  quantity: z.number().positive()
  unitPriceAgora: z.number().int().nonnegative()
  discountPercent: z.number().min(0).max(100)
  vatRateBasisPoints: z.number().int().nonnegative()

lineItemResultSchema:
  lineTotalAgora: z.number().int()        // after discount, before VAT
  vatAmountAgora: z.number().int()        // rounded per line
  lineTotalInclVatAgora: z.number().int() // lineTotal + VAT

invoiceTotalsSchema:
  subtotalAgora: z.number().int()       // sum of individually-rounded gross amounts (before discount)
  discountAgora: z.number().int()       // sum of line discounts
  totalExclVatAgora: z.number().int()   // sum of lineTotals
  vatAgora: z.number().int()            // sum of vatAmounts
  totalInclVatAgora: z.number().int()   // totalExclVat + vat

function calculateLine(item: LineItemInput): LineItemResult
function calculateInvoiceTotals(items: LineItemInput[]): InvoiceTotals
```

**Rounding**: `Math.round` (standard rounding). Israel uses standard rounding for tax calculations. Rounding order: round gross first, then compute and round discount, then compute and round VAT. Two rounding operations before `lineTotal` — this is intentional and matches the per-line verification method.

**VAT per line, then sum**: This matches how Israeli accountants verify — they check each line independently. The sum of per-line VAT may differ from "VAT on subtotal" by a few agora due to rounding. Per-line is the legally correct method.

**Zero amounts**: `unitPriceAgora = 0` is allowed (complimentary items). `discountPercent = 100` is allowed (produces `lineTotal = 0`). The VAT engine does not reject these — validation is the service layer's job.

### Server-Side Validation on Finalization

- If `businessType = exempt_dealer`: all line item `vatRate` must be `0`. Reject with 422 otherwise.
- If `businessType != exempt_dealer`: `vatRate` must be `0` or `1700` (current standard rate). Other values rejected.
- All amounts recalculated from inputs. Client-submitted totals are discarded.
- The VAT engine itself does **not** enforce valid rates — it calculates for any rate. Rate validation lives in the service layer (T07). The engine runs in the browser for preview and should not block on invalid rates.

### `invoiceDate` Validation

- Zod validates it's a valid ISO date string
- Service layer enforces business rules: warn (not block) if > 30 days in the past, reject if > 7 days in future
- Exact backdating window needs accountant confirmation (see T-LEGAL-01)

---

## Zod Schemas (`types/src/invoices.ts`)

### Core Schemas

```
documentTypeSchema       — z.enum(['tax_invoice', 'tax_invoice_receipt', 'receipt', 'credit_note'])
sequenceGroupSchema      — z.enum(['tax_document', 'credit_note', 'receipt'])
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
invoiceItemSchema        — full item with id, all calculated fields (quantity/discountPercent as numbers)
invoiceSchema            — full invoice with all fields
invoiceResponseSchema    — { invoice, items[] }
invoiceListItemSchema    — id, fullNumber, customerName, documentType, invoiceDate, totalInclVatAgora, status, isOverdue
invoiceListResponseSchema — { invoices[], total }
```

### Param Schemas

```
invoiceParamSchema       — { businessId }
invoiceIdParamSchema     — { businessId, invoiceId }
```

**Note**: `invoiceListQuerySchema` deferred to T09 (belongs with the list endpoint).

---

## pg-mem Compatibility

All features verified compatible:
- `numeric(12,4)` columns ✅
- `date` columns ✅
- New pgEnum definitions ✅
- Partial unique index (`WHERE col IS NOT NULL`) ✅
- Composite primary key ✅
- `db.transaction()` ✅

**Not testable in pg-mem**: Concurrent row-level locking (SELECT FOR UPDATE). The load test runs against real Postgres.

---

## Links

- Branch: —
- PR: —
