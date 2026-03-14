import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { injectAuthed } from '../utils/inject.js';
import {
  createOwnerWithBusiness,
  createAuthedUser,
  createTestBusiness,
  createUser,
  addUserToBusiness,
} from '../utils/businesses.js';
import { setupIntegrationTest } from '../utils/server.js';
import { db } from '../../src/db/client.js';
import { invoices } from '../../src/db/schema.js';
import type { DashboardResponse } from '@bon/types/dashboard';

// ── helpers ──

async function createFinalized(
  businessId: string,
  overrides: Partial<typeof invoices.$inferInsert> = {}
) {
  const [inv] = await db
    .insert(invoices)
    .values({
      businessId,
      documentType: 'tax_invoice',
      status: 'finalized',
      invoiceDate: '2026-03-10',
      issuedAt: new Date('2026-03-10T10:00:00Z'),
      totalInclVatMinorUnits: 10000,
      ...overrides,
    })
    .returning();
  return inv!;
}

describe('routes/dashboard', () => {
  const ctx = setupIntegrationTest();

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-03-15T12:00:00Z') });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── helpers ──

  async function getDashboard(sessionId: string, businessId: string) {
    return injectAuthed(ctx.app, sessionId, {
      method: 'GET',
      url: `/businesses/${businessId}/dashboard`,
    });
  }

  // ── tests ──

  it('returns empty dashboard for a new business', async () => {
    const { sessionId, business } = await createOwnerWithBusiness();
    const res = await getDashboard(sessionId, business.id);

    expect(res.statusCode).toBe(200);
    const data = res.json() as DashboardResponse;

    expect(data.outstandingAmountMinorUnits).toBe(0);
    expect(data.outstandingCount).toBe(0);
    expect(data.overdueCount).toBe(0);
    expect(data.revenueThisMonthMinorUnits).toBe(0);
    expect(data.invoiceCountThisMonth).toBe(0);
    expect(data.recentInvoices).toHaveLength(0);
  });

  it('returns correct KPIs when invoices exist', async () => {
    const { sessionId, business } = await createOwnerWithBusiness();

    // Create a sent invoice (outstanding, counts toward revenue)
    await createFinalized(business.id, {
      status: 'sent',
      customerName: 'Test Customer',
      totalInclVatMinorUnits: 25000,
    });

    const res = await getDashboard(sessionId, business.id);
    expect(res.statusCode).toBe(200);

    const data = res.json() as DashboardResponse;
    expect(data.outstandingAmountMinorUnits).toBe(25000);
    expect(data.outstandingCount).toBe(1);
    expect(data.revenueThisMonthMinorUnits).toBe(25000);
    expect(data.invoiceCountThisMonth).toBe(1);
    expect(data.recentInvoices).toHaveLength(1);
    expect(data.recentInvoices[0].customerName).toBe('Test Customer');
  });

  it('returns overdue invoices in the mini-list', async () => {
    const { sessionId, business } = await createOwnerWithBusiness();

    await createFinalized(business.id, {
      status: 'sent',
      isOverdue: true,
      dueDate: '2026-02-01',
      customerName: 'Late Payer',
      totalInclVatMinorUnits: 5000,
    });

    const res = await getDashboard(sessionId, business.id);
    const data = res.json() as DashboardResponse;

    expect(data.overdueCount).toBe(1);
    expect(data.overdueAmountMinorUnits).toBe(5000);
  });

  it('rejects non-member with 404', async () => {
    const { sessionId } = await createAuthedUser();
    const owner = await createUser();
    const business = await createTestBusiness(owner.id);
    await addUserToBusiness(owner.id, business.id, 'owner');

    const res = await getDashboard(sessionId, business.id);
    expect(res.statusCode).toBe(404);
  });
});
