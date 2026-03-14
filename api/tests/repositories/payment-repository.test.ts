import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '../../src/db/client.js';
import { businesses, invoices, invoicePayments, users } from '../../src/db/schema.js';
import { randomInt, randomUUID } from 'node:crypto';
import { sumPaymentsForPeriod } from '../../src/repositories/payment-repository.js';
import { resetDb } from '../utils/db.js';

// ── helpers ──

async function seedBusinessWithUser() {
  const [user] = await db
    .insert(users)
    .values({ email: `user-${randomUUID()}@test.com`, name: 'Test' })
    .returning();
  const now = new Date();
  const [biz] = await db
    .insert(businesses)
    .values({
      name: 'Test Biz',
      businessType: 'licensed_dealer',
      registrationNumber: String(randomInt(100_000_000, 1_000_000_000)),
      createdByUserId: user!.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return { user: user!, business: biz! };
}

async function createInvoice(businessId: string) {
  const now = new Date();
  const [inv] = await db
    .insert(invoices)
    .values({
      businessId,
      documentType: 'tax_invoice',
      invoiceDate: '2026-03-10',
      status: 'sent',
      totalInclVatMinorUnits: 10000,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return inv!;
}

async function createPayment(invoiceId: string, userId: string, paidAt: string, amount: number) {
  await db.insert(invoicePayments).values({
    invoiceId,
    amountMinorUnits: amount,
    paidAt,
    method: 'cash',
    recordedByUserId: userId,
  });
}

// ── tests ──

describe('sumPaymentsForPeriod', () => {
  let businessId: string;
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const { user, business } = await seedBusinessWithUser();
    businessId = business.id;
    userId = user.id;
  });

  it('sums payments within the date range', async () => {
    const inv = await createInvoice(businessId);
    await createPayment(inv.id, userId, '2026-03-05', 3000);
    await createPayment(inv.id, userId, '2026-03-15', 5000);

    const total = await sumPaymentsForPeriod(businessId, '2026-03-01', '2026-04-01');
    expect(total).toBe(8000);
  });

  it('uses gte for dateFrom and lt for dateTo', async () => {
    const inv = await createInvoice(businessId);
    await createPayment(inv.id, userId, '2026-03-01', 1000);
    await createPayment(inv.id, userId, '2026-04-01', 2000);

    const total = await sumPaymentsForPeriod(businessId, '2026-03-01', '2026-04-01');
    expect(total).toBe(1000);
  });

  it('excludes payments outside the date range', async () => {
    const inv = await createInvoice(businessId);
    await createPayment(inv.id, userId, '2026-02-28', 5000);
    await createPayment(inv.id, userId, '2026-04-01', 3000);

    const total = await sumPaymentsForPeriod(businessId, '2026-03-01', '2026-04-01');
    expect(total).toBe(0);
  });

  it('scopes to the provided businessId', async () => {
    const { user: otherUser, business: otherBiz } = await seedBusinessWithUser();
    const inv = await createInvoice(businessId);
    const otherInv = await createInvoice(otherBiz.id);

    await createPayment(inv.id, userId, '2026-03-10', 1000);
    await createPayment(otherInv.id, otherUser.id, '2026-03-10', 9000);

    const total = await sumPaymentsForPeriod(businessId, '2026-03-01', '2026-04-01');
    expect(total).toBe(1000);
  });

  it('returns 0 when no payments match', async () => {
    const total = await sumPaymentsForPeriod(businessId, '2026-03-01', '2026-04-01');
    expect(total).toBe(0);
  });
});
