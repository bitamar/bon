# T15 — Payment Recording

**Status**: 📝 Needs spec work (Architect pass required)
**Phase**: 5 — Invoice Lifecycle
**Requires**: T08-D merged (needs detail page for payment button; does NOT depend on T14 SHAAM)
**Blocks**: T16

**Dependency correction**: This ticket was previously listed as depending on T14 (SHAAM emergency numbers). Payments have nothing to do with SHAAM. The actual dependency is T08-D (the invoice detail page where the payment button lives). This allows payment work to start in parallel with SHAAM work (Stream D).

---

## What & Why

An invoice isn't done until it's paid. Payment recording closes the loop and lets the business track cash flow. Partial payments matter — a common scenario in Israeli B2B is paying 50% upfront and 50% on delivery.

---

## Recommended PR Split

- **PR 1 — Backend**: `invoice_payments` table + migration, repository, service (balance calculation, status transitions), `POST .../payments` endpoint, `GET .../payments` endpoint, Zod schemas in `types/src/payments.ts`, route tests
- **PR 2 — Frontend**: Payment modal on invoice detail page, payment history display, component tests

---

## Acceptance Criteria

### Backend

- [ ] Migration creates `invoice_payments` table:
  ```
  id                uuid PK
  invoiceId         uuid FK → invoices NOT NULL (ON DELETE CASCADE)
  businessId        uuid FK → businesses NOT NULL
  amountMinorUnits  integer NOT NULL           — positive, ≤ remaining balance
  paidAt            date NOT NULL              — the actual payment date (user-provided)
  method            paymentMethodEnum NOT NULL
  reference         text                       — check number, transfer ref, etc.
  notes             text
  recordedByUserId  uuid FK → users NOT NULL
  createdAt         timestamp with tz NOT NULL DEFAULT now()

  INDEX (invoiceId)
  INDEX (businessId, createdAt)
  ```
- [ ] New enum `paymentMethodEnum`: `cash`, `transfer`, `credit`, `check`, `other`
- [ ] Drizzle schema in `api/src/db/schema.ts`
- [ ] Zod schemas in `types/src/payments.ts`:
  ```typescript
  paymentMethodSchema = z.enum(['cash', 'transfer', 'credit', 'check', 'other'])

  createPaymentBodySchema = z.object({
    amountMinorUnits: z.number().int().positive(),
    paidAt: z.string().trim().date(),
    method: paymentMethodSchema,
    reference: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(1000).optional(),
  }).strict()

  paymentSchema = z.object({
    id: uuidSchema,
    invoiceId: uuidSchema,
    amountMinorUnits: z.number().int(),
    paidAt: z.string(),
    method: paymentMethodSchema,
    reference: nullableString,
    notes: nullableString,
    recordedByUserId: uuidSchema,
    createdAt: isoDateTime,
  })

  paymentMethodLabels: Record<PaymentMethod, string> = {
    cash: 'מזומן',
    transfer: 'העברה בנקאית',
    credit: 'אשראי',
    check: 'שיק',
    other: 'אחר',
  }
  ```

- [ ] `POST /businesses/:businessId/invoices/:invoiceId/payments` — record a payment (returns 201)
  - Validation:
    - Invoice must be `finalized`, `sent`, or `partially_paid` (not draft, paid, cancelled, credited) — return 422 `invalid_status`
    - `amountMinorUnits` must be > 0 and ≤ remaining balance — return 422 `amount_exceeds_balance`
    - No overpayment allowed (simplifies accounting; overpayments handled via credit notes)
  - Logic:
    1. Calculate remaining balance: `invoice.totalInclVatMinorUnits - SUM(existing payments)`
    2. Insert payment record
    3. If `amountMinorUnits === remainingBalance`: set invoice status → `paid`, set `paidAt = paidAt from body`
    4. If `amountMinorUnits < remainingBalance`: set invoice status → `partially_paid`
    5. Invalidate PDF cache (the status banner on the PDF may need to change)
  - All inside a transaction (read payments + insert + update invoice)
- [ ] `GET /businesses/:businessId/invoices/:invoiceId/payments` — list payments for an invoice (returns 200)
  - Returns `{ payments: Payment[], totalPaidMinorUnits: number, remainingBalanceMinorUnits: number }`
  - Ordered by `paidAt ASC, createdAt ASC`

### Payment Deletion

- [ ] **No payment deletion or editing in MVP.** Incorrect payments are corrected by recording a credit note (T16) or a negative adjustment in the accounting system. This matches Israeli accounting standards — you don't delete payment records from the ledger.
- [ ] Document this decision clearly in the API (if someone tries `DELETE .../payments/:id`, return 405 Method Not Allowed with message "לא ניתן למחוק רישום תשלום. השתמשו בחשבונית זיכוי לתיקון.")

### Balance Calculation

- [ ] `getRemainingBalance(invoiceId, txOrDb?)` in repository:
  ```typescript
  async function getRemainingBalance(invoiceId: string, txOrDb: TxOrDb = db): Promise<number> {
    const [result] = await txOrDb
      .select({ total: sql<number>`COALESCE(SUM(${invoicePayments.amountMinorUnits}), 0)` })
      .from(invoicePayments)
      .where(eq(invoicePayments.invoiceId, invoiceId));
    return invoiceTotalInclVat - result.total;
  }
  ```
- [ ] Balance is always calculated from payments table (not stored on invoice) — prevents stale data

### Frontend

- [ ] "סמן כשולם" button on invoice detail page (replaces disabled placeholder from T08-D)
  - Only enabled for statuses: `finalized`, `sent`, `partially_paid`
- [ ] **Payment modal** (size="md"):
  - [ ] Header: "רישום תשלום"
  - [ ] Body:
    - `NumberInput` for amount (prefix="₪", decimalScale=2, min=0.01, max=remainingBalance/100). Defaults to remaining balance.
    - `DatePickerInput` for payment date (defaults to today, Hebrew locale)
    - `Select` for method (5 options from `paymentMethodLabels`)
    - `TextInput` for reference (optional, placeholder "מספר שיק / אסמכתא")
    - `Textarea` for notes (optional)
    - Info line: "יתרה לתשלום: ₪{remaining}" displayed above amount field
  - [ ] Footer: "ביטול" (subtle) + "רשום תשלום" (loading state)
  - [ ] On success: close modal, success toast, invalidate invoice query + payments query
  - [ ] On error: inline error in modal
  - [ ] Amount validation: show inline error if > remaining balance (client-side check before submit)
- [ ] **Payment history** on invoice detail page:
  - Shown below the invoice data, only if payments exist
  - Table/list: date, amount, method label, reference, recorded by
  - Summary: "שולם: ₪{totalPaid} מתוך ₪{invoiceTotal}" with progress indicator
- [ ] Tests: modal opens with correct defaults, successful payment recording, amount exceeds balance error

### General

- [ ] `npm run check` passes
- [ ] Route tests: successful payment (partial + full), amount exceeds balance → 422, invalid status → 422, payment list, multi-tenant isolation
- [ ] Repository tests: balance calculation, payment insert
- [ ] Frontend tests: modal, payment history display

---

## Architecture Notes

### `paidAt` Semantics

`paidAt` on the invoice record is the date of the payment that completed the full balance (from the payment body, not `new Date()`). It represents "when the customer paid" not "when we recorded it." `createdAt` on the payment record captures the recording timestamp.

### Status Transitions

```
finalized      + payment < total → partially_paid
finalized      + payment = total → paid
sent           + payment < total → partially_paid
sent           + payment = total → paid
partially_paid + payment < remaining → partially_paid (no change)
partially_paid + payment = remaining → paid
```

### Credited Invoices Cannot Receive Payments

If an invoice is `credited`, payment recording is blocked (422 `invalid_status`). The credit note supersedes the invoice — any refund is handled separately.

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
