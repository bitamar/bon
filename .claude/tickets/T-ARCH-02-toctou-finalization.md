# T-ARCH-02 — Fix TOCTOU Race in Invoice Finalization

**Status**: ⬜ Not started
**Phase**: Cross-cutting (correctness)
**Requires**: T-ARCH-01 merged (needs txOrDb on customer repo)
**Blocks**: T08-B (finalization must be correct before extending it)

---

## What & Why

The invoice finalization function (`api/src/services/invoice-service.ts`) has a documented TOCTOU (Time-of-Check-Time-of-Use) race condition:

```
// TODO: TOCTOU — move validation inside tx with SELECT FOR UPDATE before SHAAM integration
```

**Current flow:**
1. Read invoice (outside tx)
2. Read customer (outside tx)
3. Read invoice items (outside tx)
4. Read business (outside tx)
5. Validate all of the above
6. Open transaction → assign sequence number → update invoice → insert items
7. Commit

**The bug:** Between steps 1-5 and step 6, another request could:
- Modify the draft (changing items, customer, amounts)
- Delete the customer
- Change business settings (VAT rate)
- Even finalize the same draft (double-finalization)

The sequence number assignment is correct (inside tx), but validation runs on stale data.

---

## Fix

Move ALL reads and validation inside a single transaction with `SELECT ... FOR UPDATE` on the invoice row:

```typescript
export async function finalize(businessId: string, invoiceId: string, body: FinalizeBody) {
  return db.transaction(async (tx) => {
    // 1. Lock the invoice row
    const invoice = await findInvoiceByIdForUpdate(invoiceId, businessId, tx);
    if (!invoice) throw notFound();
    if (invoice.status !== 'draft') throw unprocessableEntity({ code: 'not_draft' });

    // 2. Read related data inside tx
    const customer = invoice.customerId
      ? await findCustomerById(invoice.customerId, businessId, tx)
      : null;
    const items = await findItemsByInvoiceId(invoiceId, tx);
    const business = await findBusinessById(businessId, tx);

    // 3. Validate (now guaranteed consistent)
    validateForFinalization(invoice, customer, items, business, body);

    // 4. Recalculate totals
    const totals = recalculateTotals(items, business);

    // 5. Assign sequence number (already inside tx)
    const { sequenceNumber, documentNumber } = await assignInvoiceNumber(businessId, ...);

    // 6. Update invoice
    return updateInvoice(invoiceId, businessId, { ...totals, ...snapshot, status: 'finalized' }, tx);
  });
}
```

---

## Deliverables

### New Repository Method

Add `findInvoiceByIdForUpdate` to `invoice-repository.ts`:

```typescript
export async function findInvoiceByIdForUpdate(
  invoiceId: string,
  businessId: string,
  tx: DbOrTx
) {
  const rows = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, businessId)))
    .for('update');
  return rows[0] ?? null;
}
```

### Modified Files (3-4)

| File | Change |
|------|--------|
| `api/src/repositories/invoice-repository.ts` | Add `findInvoiceByIdForUpdate` |
| `api/src/services/invoice-service.ts` | Move all finalize reads + validation inside transaction |
| `api/tests/services/invoice-service.test.ts` | Add test for concurrent finalization attempt |
| `api/tests/repositories/invoice-repository.test.ts` | Test for `findInvoiceByIdForUpdate` |

---

## Acceptance Criteria

- [ ] All reads in `finalize()` happen inside the transaction
- [ ] Invoice row is locked with `SELECT ... FOR UPDATE` before validation
- [ ] Double-finalization of same draft returns error (not two finalized invoices)
- [ ] Customer snapshot uses data read inside the transaction
- [ ] TODO comment removed
- [ ] Existing finalization tests still pass
- [ ] New test: concurrent finalization of same draft → one succeeds, one fails
- [ ] `npm run check` passes

---

## Notes

- pg-mem does not support `SELECT ... FOR UPDATE` semantics properly. The locking test may need to be a unit test that verifies the query is called with the right parameters, or deferred to an integration test with real Postgres.
- The `findBusinessById` call also needs txOrDb support — verify the business repository has this.

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
