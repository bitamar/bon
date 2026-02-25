# T-ARCH-02 — Fix TOCTOU Race in Invoice Finalization

**Status**: ⬜ Not started
**Phase**: Cross-cutting (correctness)
**Requires**: T-ARCH-01 merged (needs txOrDb on customer repo and business repo)
**Blocks**: T08-B (finalization must be correct before extending it)

---

## What & Why

The invoice finalization function (`api/src/services/invoice-service.ts`) has a documented TOCTOU (Time-of-Check-Time-of-Use) race condition:

```typescript
// TODO: TOCTOU — move validation inside tx with SELECT FOR UPDATE before SHAAM integration
```

**Current flow:**
1. Read invoice (outside tx) — `invoice-service.ts:301`
2. Read customer (outside tx) — `invoice-service.ts:311`
3. Read invoice items (outside tx) — `invoice-service.ts:320`
4. Read business (outside tx) — `invoice-service.ts:333`
5. Validate all of the above
6. Open transaction → assign sequence number → update invoice → insert items — `invoice-service.ts:348`
7. Commit

**The bug:** Between steps 1-5 and step 6, another request could:
- Modify the draft (changing items, customer, amounts)
- Delete the customer
- Change business settings (VAT rate)
- Even finalize the same draft (double-finalization)

The sequence number assignment is correct (inside tx), but validation runs on stale data.

---

## Fix

**Chosen strategy: Lock the invoice row with `SELECT ... FOR UPDATE`, then read related data inside the same transaction under READ COMMITTED.**

Rationale for choosing row-locking over REPEATABLE READ or SERIALIZABLE:
- The invoice lock prevents the primary race (double-finalization, concurrent draft edits)
- Customer and business data are read-only during finalization — concurrent changes to customer/business settings are unlikely during the sub-second window of the transaction
- REPEATABLE READ would add serialization failures requiring retry logic, which is disproportionate complexity for the actual risk
- If stronger guarantees are needed later (SHAAM integration), the transaction can be upgraded to REPEATABLE READ at that point

Move ALL reads and validation inside a single transaction with `SELECT ... FOR UPDATE` on the invoice row:

```typescript
export async function finalize(businessId: string, invoiceId: string, body: FinalizeBody) {
  return db.transaction(async (tx) => {
    // 1. Lock the invoice row — prevents double-finalization and concurrent edits
    const invoice = await findInvoiceByIdForUpdate(invoiceId, businessId, tx);
    if (!invoice) throw notFound();
    if (invoice.status !== 'draft') throw unprocessableEntity({ code: 'not_draft' });

    // 2. Read related data inside tx (READ COMMITTED — sees committed changes)
    // Customer and business are not locked; concurrent changes are accepted as
    // a documented trade-off. The snapshot captures the committed state at read time.
    const customer = invoice.customerId
      ? await findCustomerById(invoice.customerId, businessId, tx)
      : null;
    const items = await findItemsByInvoiceId(invoiceId, tx);
    const business = await findBusinessById(businessId, tx);

    // 3. Validate (consistent with the locked invoice state)
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

**Documented trade-off:** Customer and business rows are NOT locked with `FOR UPDATE`. Under READ COMMITTED, a concurrent change to customer name or business VAT rate could be picked up mid-transaction. This is acceptable because:
- Customer/business changes during the sub-second finalization window are extremely rare
- The snapshot captures whatever committed state exists at read time — still consistent
- If SHAAM integration requires stricter guarantees, upgrade to `REPEATABLE READ` at that point

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

### Pre-requisite from T-ARCH-01

`findBusinessById` in `api/src/repositories/business-repository.ts` must accept a `txOrDb` parameter (currently it does not — verified). T-ARCH-01 adds this.

### Modified Files (4)

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
- [ ] `findBusinessById` accepts `txOrDb` parameter (done in T-ARCH-01; verified here)
- [ ] Existing finalization tests still pass
- [ ] **Interim**: pg-mem unit test asserting that `findInvoiceByIdForUpdate` is invoked during finalize (pg-mem does not support `FOR UPDATE` semantics)
- [ ] **Required for close**: Postgres-backed integration test demonstrating correct row-lock behavior — two concurrent finalization requests on the same draft must result in exactly one success and one failure. This test may use testcontainers or a real Postgres instance.
- [ ] `npm run check` passes

---

## Test Strategy

### Interim Coverage (pg-mem)

A unit test that:
1. Creates a draft invoice with items and a customer
2. Calls `finalize()` and verifies it succeeds
3. Calls `finalize()` again on the same invoice and verifies it throws `not_draft`
4. Asserts the locking query was invoked (via spy or by verifying the service calls the `ForUpdate` variant)

This provides coverage during development but **does not verify actual row-lock semantics**.

### Required Integration Test (real Postgres)

A test using a real PostgreSQL instance (testcontainers or dev DB on port 5433) that:
1. Creates a draft invoice
2. Opens two concurrent `finalize()` calls
3. Verifies exactly one succeeds and the other gets `not_draft` or a lock-wait timeout
4. Verifies only one sequence number was consumed

**This ticket is only closable after the Postgres integration test passes.** The pg-mem unit tests are allowed as interim coverage.

---

## Notes

- The `findBusinessById` call also needs txOrDb support — verified that `business-repository.ts` currently does NOT have it. T-ARCH-01 must add this before T-ARCH-02 can be implemented.
- If T-ARCH-06 (testcontainers) is completed before this ticket, use it for the integration test. Otherwise, use the dev Postgres on port 5433.

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
