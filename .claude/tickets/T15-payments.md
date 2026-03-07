# T15 — Payment Recording

**Status**: 🟡 Ready (all technical dependencies met)
**Phase**: 5 — Invoice Lifecycle
**Requires**: Phase 4 complete (build order), T08-D merged ✓ (invoice detail view)
**Blocks**: T16

> **Dependency note**: Payment recording has **zero technical dependency** on SHAAM — it needs invoices (done since T08) and the invoice detail view (T08-D). The `isOverdue` column already exists in the schema; T15 clears it on full payment independently of T-CRON-02's cron job that sets it. T15 is gated by build order (Phase 4 complete), not by any specific technical dependency.

---

## What & Why

An invoice isn't done until it's paid. Payment recording closes the loop and lets the business track cash flow. Partial payments matter — a common scenario in Israeli B2B is paying 50% upfront and 50% on delivery.

Multiple payments per invoice is the norm, not the exception. The `paidAt` field on the `invoices` table records *when* the invoice was fully paid; individual payment records live in `invoice_payments`.

---

## Acceptance Criteria

### Backend

- [ ] `invoice_payments` table created (schema below)
- [ ] Payment method enum: `cash`, `transfer`, `credit`, `check`, `other`
- [ ] `POST /businesses/:businessId/invoices/:invoiceId/payments` — record a payment (201)
- [ ] `GET /businesses/:businessId/invoices/:invoiceId/payments` — list payments for an invoice
- [ ] `DELETE /businesses/:businessId/invoices/:invoiceId/payments/:paymentId` — delete a payment (undo)
- [ ] Payable statuses: `finalized`, `sent`, `partially_paid` — reject if invoice is `draft`, `paid`, `cancelled`, `credited`
- [ ] Partial payment → status becomes `partially_paid`, `paidAt` stays null
- [ ] Full payment (cumulative payments ≥ `totalInclVatMinorUnits`) → status becomes `paid`, `paidAt` set to most recent payment's `paidAt`
- [ ] Deleting a payment recalculates: may revert `paid` → `partially_paid`, or `partially_paid` → `finalized`/`sent` (restore previous status)
- [ ] Overpayment not allowed — validate `amount ≤ remaining balance`
- [ ] Amount must be > 0
- [ ] Transaction safety: lock invoice row (`findInvoiceByIdForUpdate`) before recording/deleting payment
- [ ] When payment makes invoice fully paid AND `isOverdue` is true, clear `isOverdue` to false
- [ ] Invoice detail response (`GET .../invoices/:invoiceId`) includes `payments` array and `remainingBalanceMinorUnits`
- [ ] Requires `owner` or `admin` role
- [ ] Zod schemas in `types/src/payments.ts` (shared between API and frontend)
- [ ] `npm run check` passes

### Frontend

- [ ] "סמן כשולם" button enabled on invoice detail when status is `finalized`, `sent`, or `partially_paid`
- [ ] Button opens modal with fields:
  - [ ] **סכום** — `NumberInput` with `prefix="₪"`, `decimalScale={2}`, defaults to remaining balance
  - [ ] **תאריך תשלום** — `DatePickerInput`, defaults to today
  - [ ] **אמצעי תשלום** — `Select` with Hebrew labels (מזומן, העברה בנקאית, אשראי, שיק, אחר)
  - [ ] **אסמכתא** — `TextInput`, optional (check number, transfer reference, etc.)
  - [ ] **הערות** — `Textarea`, optional
- [ ] Validates: amount > 0, amount ≤ remaining balance, date required, method required
- [ ] On success: close modal, invalidate invoice + invoice list queries, show success toast
- [ ] Payment history section on invoice detail page:
  - [ ] Chronological list of payments
  - [ ] Each row: date, amount, method (Hebrew label), reference, recorded by
  - [ ] Delete button (trash icon) on each payment row — confirm modal before deleting
  - [ ] Empty state when no payments recorded
- [ ] Remaining balance shown prominently near totals section
- [ ] Frontend test: successful payment submission + one validation error case

---

## Architecture Notes

### Outstanding Balance Calculation

```
remainingBalance = invoice.totalInclVatMinorUnits - SUM(payments.amountMinorUnits)
```

Calculated server-side; returned as `remainingBalanceMinorUnits` in the invoice response. Never trust the client.

### Status Transitions

```
finalized ──┬── partial payment ──→ partially_paid
sent ───────┘                          │
                                       ├── more partial ──→ partially_paid (stays)
                                       └── full payment ──→ paid

Deleting a payment reverses:
paid ──→ partially_paid (if other payments remain)
partially_paid ──→ finalized/sent (if no payments remain — restore pre-payment status)
```

**Pre-payment status tracking**: When recording the first payment on a `finalized` or `sent` invoice, store the current status in a `statusBeforePayment` column so deletions can restore it accurately. Alternative: derive from `sentAt` — if `sentAt` is set, restore to `sent`; otherwise restore to `finalized`.

Preferred approach: derive from `sentAt` (simpler, no extra column). If `sentAt IS NOT NULL` → restore to `sent`, else → restore to `finalized`.

### Transaction Safety

Payment recording and deletion must lock the invoice row to prevent race conditions (two concurrent partial payments that both think they're making it "fully paid"):

```typescript
await db.transaction(async (tx) => {
  const invoice = await findInvoiceByIdForUpdate(invoiceId, businessId, tx);
  // validate status, calculate remaining, insert payment, update status
});
```

### Schema

#### `invoice_payments` table

```
invoice_payments:
  id                uuid PK default gen_random_uuid()
  invoiceId         uuid FK → invoices NOT NULL (cascade delete)
  amountMinorUnits  integer NOT NULL           — always positive, in minor units
  paidAt            date NOT NULL              — date of payment (not recording time)
  method            paymentMethodEnum NOT NULL  — cash, transfer, credit, check, other
  reference         text                       — check #, transfer ref, etc.
  notes             text
  recordedByUserId  uuid FK → users NOT NULL
  createdAt         timestamptz NOT NULL default now()

Index: (invoiceId) for lookups
```

#### Payment method enum

```sql
CREATE TYPE payment_method AS ENUM ('cash', 'transfer', 'credit', 'check', 'other');
```

Hebrew labels (frontend only, not in DB):

| Value | Hebrew |
|-------|--------|
| `cash` | מזומן |
| `transfer` | העברה בנקאית |
| `credit` | אשראי |
| `check` | שיק |
| `other` | אחר |

### Response Schema Extension

`invoiceResponseSchema` in `types/src/invoices.ts` currently returns `{ invoice, items }`. T15 extends it to:

```typescript
export const invoiceResponseSchema = z.object({
  invoice: invoiceSchema,
  items: z.array(lineItemSchema),
  payments: z.array(paymentSchema),            // NEW
  remainingBalanceMinorUnits: z.number().int(), // NEW
});
```

This is a backward-compatible addition (new fields). The serializer in `api/src/lib/invoice-serializers.ts` must include payments and computed remaining balance. Payments are always returned (empty array for drafts).

### Zod Schemas (`types/src/payments.ts`)

```typescript
// Shared between API and frontend
export const PAYMENT_METHODS = ['cash', 'transfer', 'credit', 'check', 'other'] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

export const recordPaymentBodySchema = z.object({
  amountMinorUnits: z.number().int().positive(),
  paidAt: z.string().date(),           // ISO date string (YYYY-MM-DD)
  method: paymentMethodSchema,
  reference: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
});

export const paymentSchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  amountMinorUnits: z.number().int(),
  paidAt: z.string(),
  method: paymentMethodSchema,
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  recordedByUserId: z.string().uuid(),
  createdAt: z.string(),
});
```

### API Endpoints

| Method | Path | Request | Response | Status |
|--------|------|---------|----------|--------|
| `POST` | `.../invoices/:invoiceId/payments` | `recordPaymentBodySchema` | Updated invoice response (with payments + remainingBalance) | 201 |
| `GET` | `.../invoices/:invoiceId/payments` | — | `paymentSchema[]` | 200 |
| `DELETE` | `.../invoices/:invoiceId/payments/:paymentId` | — | Updated invoice response | 200 |

### Error Codes

| Code | HTTP | When |
|------|------|------|
| `invoice_not_found` | 404 | Invoice doesn't exist or wrong business |
| `invoice_not_payable` | 422 | Status not in `finalized`, `sent`, `partially_paid` |
| `payment_exceeds_balance` | 422 | Amount > remaining balance |
| `payment_not_found` | 404 | Payment ID doesn't exist |
| `cannot_delete_payment` | 422 | Invoice is `cancelled` or `credited` (can't modify payments) |

### File Locations

| Component | Path |
|-----------|------|
| DB schema addition | `api/src/db/schema.ts` |
| Migration | `api/drizzle/XXXX_*.sql` (generated) |
| Repository | `api/src/repositories/payment-repository.ts` |
| Service logic | `api/src/services/invoice-service.ts` (add `recordPayment`, `deletePayment`) |
| Route handlers | `api/src/routes/invoices.ts` (add 3 endpoints) |
| Shared types | `types/src/payments.ts` |
| Frontend API | `front/src/api/invoices.ts` (add `recordPayment`, `deletePayment`, `fetchPayments`) |
| Payment modal | `front/src/pages/InvoiceDetail.tsx` (enable button, add modal + payment history) |
| Tests (API) | `api/tests/routes/payment-routes.test.ts` |
| Tests (frontend) | `front/src/test/pages/InvoiceDetail.test.tsx` (extend existing) |

### Test Requirements

**API tests** (`api/tests/routes/payment-routes.test.ts`):
- Record payment on finalized invoice → 201, status becomes `paid`
- Partial payment → status becomes `partially_paid`
- Second partial payment that completes balance → `paid`
- Payment exceeding balance → 422
- Payment on draft invoice → 422
- Payment on cancelled invoice → 422
- Delete payment reverts status correctly
- List payments returns chronological order
- Role check: `user` role cannot record payment

**Frontend tests**:
- Payment modal opens on button click
- Successful submission calls API and closes modal
- Validation error shown when amount exceeds balance

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
