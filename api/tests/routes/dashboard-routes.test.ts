import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { injectAuthed } from '../utils/inject.js';
import { createOwnerWithBusiness, createUser, createTestBusiness } from '../utils/businesses.js';
import { setupIntegrationTest } from '../utils/server.js';
import type { DashboardResponse } from '@bon/types/dashboard';

// ── helpers ──

async function getDashboard(app: FastifyInstance, sessionId: string, businessId: string) {
  return injectAuthed(app, sessionId, {
    method: 'GET',
    url: `/businesses/${businessId}/dashboard`,
  });
}

async function createCustomer(app: FastifyInstance, sessionId: string, businessId: string) {
  const res = await injectAuthed(app, sessionId, {
    method: 'POST',
    url: `/businesses/${businessId}/customers`,
    payload: { name: 'Test Customer' },
  });
  return (res.json() as { customer: { id: string } }).customer;
}

async function createAndFinalizeInvoice(
  app: FastifyInstance,
  sessionId: string,
  businessId: string,
  customerId: string,
  amount = 10000
) {
  const draft = await injectAuthed(app, sessionId, {
    method: 'POST',
    url: `/businesses/${businessId}/invoices`,
    payload: {
      documentType: 'tax_invoice',
      customerId,
      items: [
        {
          description: 'Service',
          quantity: 1,
          unitPriceMinorUnits: amount,
          discountPercent: 0,
          vatRateBasisPoints: 1700,
          position: 0,
        },
      ],
    },
  });
  const { invoice } = draft.json() as { invoice: { id: string } };

  await injectAuthed(app, sessionId, {
    method: 'POST',
    url: `/businesses/${businessId}/invoices/${invoice.id}/finalize`,
    payload: {},
  });

  return invoice.id;
}

// ── tests ──

describe('routes/dashboard', () => {
  const ctx = setupIntegrationTest();

  it('returns dashboard data for a business with no invoices', async () => {
    const { sessionId, business } = await createOwnerWithBusiness();

    const res = await getDashboard(ctx.app, sessionId, business.id);

    expect(res.statusCode).toBe(200);
    const data = res.json() as DashboardResponse;
    expect(data.revenueThisMonthMinorUnits).toBe(0);
    expect(data.revenuePrevMonthMinorUnits).toBe(0);
    expect(data.invoiceCountThisMonth).toBe(0);
    expect(data.invoiceCountPrevMonth).toBe(0);
    expect(data.outstandingAmountMinorUnits).toBe(0);
    expect(data.outstandingCount).toBe(0);
    expect(data.overdueAmountMinorUnits).toBe(0);
    expect(data.overdueCount).toBe(0);
    expect(data.shaamPendingCount).toBe(0);
    expect(data.shaamRejectedCount).toBe(0);
    expect(data.recentInvoices).toEqual([]);
  });

  it('returns correct aggregates after creating and finalizing an invoice', async () => {
    const { sessionId, business } = await createOwnerWithBusiness();
    const customer = await createCustomer(ctx.app, sessionId, business.id);
    await createAndFinalizeInvoice(ctx.app, sessionId, business.id, customer.id, 10000);

    const res = await getDashboard(ctx.app, sessionId, business.id);

    expect(res.statusCode).toBe(200);
    const data = res.json() as DashboardResponse;
    // 10000 + 17% VAT = 11700
    expect(data.revenueThisMonthMinorUnits).toBe(11700);
    expect(data.invoiceCountThisMonth).toBe(1);
    expect(data.outstandingAmountMinorUnits).toBe(11700);
    expect(data.outstandingCount).toBe(1);
    expect(data.recentInvoices).toHaveLength(1);
  });

  it('returns 404 when accessing another business dashboard', async () => {
    const { sessionId } = await createOwnerWithBusiness();
    const otherUser = await createUser();
    const otherBusiness = await createTestBusiness(otherUser.id);

    const res = await getDashboard(ctx.app, sessionId, otherBusiness.id);

    expect(res.statusCode).toBe(404);
  });

  it('returns 401 for unauthenticated request', async () => {
    const user = await createUser();
    const business = await createTestBusiness(user.id);

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/businesses/${business.id}/dashboard`,
    });

    expect(res.statusCode).toBe(401);
  });
});
