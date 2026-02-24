# T-BUG-01 — Fix TOCTOU Race in Invoice Finalization

**Status**: 🔒 Blocked (T7.5 must merge first)
**Phase**: 2 — Invoices (bug fix)
**Requires**: T7.5 merged (finalize endpoint exists)
**Blocks**: nothing (T13 benefits from this but is not strictly blocked)

---

## What & Why

The current `finalize()` method in `invoice-service.ts` has a Time-of-Check-Time-of-Use (TOCTOU) race condition. It validates the invoice and customer outside the transaction, then performs the finalization inside the transaction. Between the check and the use, another concurrent request could:
- Delete the customer
- Modify the invoice (change to a different customer)
- Finalize the same invoice (double-finalization)

This was noted as a TODO in the T13 ticket but should be fixed independently as a small, focused bug fix.

---

## Fix

Move customer + invoice validation **inside** the finalization transaction. Add `SELECT ... FOR UPDATE` on the invoice row to prevent concurrent finalization of the same invoice.

```typescript
// Before (current code — race condition):
const invoice = await getInvoice(businessId, invoiceId);  // outside transaction
validateDraft(invoice);
const customer = await findCustomerById(businessId, invoice.customerId);
validateActiveCustomer(customer);
await db.transaction(async (tx) => {
  const seqNum = await assignInvoiceNumber(businessId, invoice.documentType, tx);
  // ... update invoice
});

// After (fixed):
await db.transaction(async (tx) => {
  const [invoice] = await tx
    .select().from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, businessId)))
    .for('update');  // lock the row
  if (!invoice) throw new AppError('not_found', 404);
  if (invoice.status !== 'draft') throw new AppError('invoice_not_draft', 422);

  const customer = await findCustomerById(businessId, invoice.customerId, tx);
  if (!customer || !customer.isActive) throw new AppError('customer_inactive', 422);

  const seqNum = await assignInvoiceNumber(businessId, invoice.documentType, tx);
  // ... update invoice
});
```

---

## Acceptance Criteria

- [ ] Invoice row locked with `SELECT ... FOR UPDATE` before validation
- [ ] Customer validation happens inside the transaction
- [ ] Concurrent finalization of the same invoice: second request fails with 422 (not duplicate sequence number)
- [ ] All existing finalization tests still pass
- [ ] Add test: concurrent finalization race (if feasible with pg-mem; otherwise document as manual test)
- [ ] `npm run check` passes

---

## Scope

This is a **bug fix only** — no new features, no new endpoints, no schema changes. Should be ≤5 files changed.

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
