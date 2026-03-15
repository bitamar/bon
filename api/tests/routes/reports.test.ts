import { describe, expect, it } from 'vitest';
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
import { invoiceItems, invoicePayments, invoices } from '../../src/db/schema.js';

// ── helpers ──

async function createFinalizedInvoice(
  businessId: string,
  overrides: Partial<typeof invoices.$inferInsert> = {}
) {
  const [inv] = await db
    .insert(invoices)
    .values({
      businessId,
      documentType: 'tax_invoice',
      status: 'finalized',
      invoiceDate: '2025-06-15',
      issuedAt: new Date('2025-06-15T10:00:00Z'),
      documentNumber: 'INV-0001',
      customerName: 'Test Customer Ltd',
      customerTaxId: '123456789',
      customerAddress: '5 Dizengoff St, Tel Aviv',
      currency: 'ILS',
      subtotalMinorUnits: 10000,
      discountMinorUnits: 0,
      totalExclVatMinorUnits: 10000,
      vatMinorUnits: 1700,
      totalInclVatMinorUnits: 11700,
      ...overrides,
    })
    .returning();
  return inv!;
}

async function createInvoiceItem(
  invoiceId: string,
  overrides: Partial<typeof invoiceItems.$inferInsert> = {}
) {
  const [item] = await db
    .insert(invoiceItems)
    .values({
      invoiceId,
      position: 1,
      description: 'Consulting services',
      quantity: '1.0000',
      unitPriceMinorUnits: 10000,
      discountPercent: '0.00',
      vatRateBasisPoints: 1700,
      lineTotalMinorUnits: 10000,
      vatAmountMinorUnits: 1700,
      lineTotalInclVatMinorUnits: 11700,
      ...overrides,
    })
    .returning();
  return item!;
}

async function createInvoicePayment(
  invoiceId: string,
  recordedByUserId: string,
  overrides: Partial<typeof invoicePayments.$inferInsert> = {}
) {
  const [payment] = await db
    .insert(invoicePayments)
    .values({
      invoiceId,
      amountMinorUnits: 11700,
      paidAt: '2025-06-20',
      method: 'transfer',
      recordedByUserId,
      ...overrides,
    })
    .returning();
  return payment!;
}

async function getUniformFile(
  app: Awaited<ReturnType<typeof import('../../src/app.js').buildServer>>,
  sessionId: string,
  businessId: string,
  year: number
) {
  return injectAuthed(app, sessionId, {
    method: 'GET',
    url: `/businesses/${businessId}/reports/uniform-file?year=${year}`,
  });
}

// ── tests ──

describe('routes/reports', () => {
  const ctx = setupIntegrationTest();

  it('returns a ZIP archive for a business with finalized invoices', async () => {
    const { sessionId, business, user } = await createOwnerWithBusiness();
    const invoice = await createFinalizedInvoice(business.id);
    await createInvoiceItem(invoice.id);
    await createInvoicePayment(invoice.id, user.id);

    const res = await getUniformFile(ctx.app, sessionId, business.id, 2025);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/zip');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('.zip');

    // Verify ZIP magic bytes: PK\x03\x04
    const body = res.rawPayload;
    expect(body[0]).toBe(0x50); // P
    expect(body[1]).toBe(0x4b); // K
  });

  it('returns 400 when no finalized invoices exist for the requested year', async () => {
    const { sessionId, business } = await createOwnerWithBusiness();
    // Create a 2025 invoice but request 2024
    await createFinalizedInvoice(business.id, { invoiceDate: '2025-03-01' });

    const res = await getUniformFile(ctx.app, sessionId, business.id, 2024);

    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe('no_data');
  });

  it('returns 400 for a missing year query parameter', async () => {
    const { sessionId, business } = await createOwnerWithBusiness();

    const res = await injectAuthed(ctx.app, sessionId, {
      method: 'GET',
      url: `/businesses/${business.id}/reports/uniform-file`,
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for an out-of-range year', async () => {
    const { sessionId, business } = await createOwnerWithBusiness();

    const res = await getUniformFile(ctx.app, sessionId, business.id, 2019);

    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for a non-member', async () => {
    const { sessionId } = await createAuthedUser();
    const owner = await createUser();
    const business = await createTestBusiness(owner.id);
    await addUserToBusiness(owner.id, business.id, 'owner');

    const res = await getUniformFile(ctx.app, sessionId, business.id, 2025);

    expect(res.statusCode).toBe(404);
  });

  it('includes invoices from the requested year only', async () => {
    const { sessionId, business } = await createOwnerWithBusiness();

    // Invoice in target year
    await createFinalizedInvoice(business.id, {
      invoiceDate: '2025-08-01',
      documentNumber: 'INV-2025',
    });
    // Invoice in different year — should be excluded
    await createFinalizedInvoice(business.id, {
      invoiceDate: '2024-12-31',
      documentNumber: 'INV-2024',
    });

    const res = await getUniformFile(ctx.app, sessionId, business.id, 2025);

    expect(res.statusCode).toBe(200);
    // ZIP returned — the 2024-only request should yield no data
    const res2024 = await getUniformFile(ctx.app, sessionId, business.id, 2024);
    expect(res2024.statusCode).toBe(200);
  });

  it('excludes draft invoices', async () => {
    const { sessionId, business } = await createOwnerWithBusiness();

    await createFinalizedInvoice(business.id, {
      status: 'draft',
      invoiceDate: '2025-05-01',
    });

    const res = await getUniformFile(ctx.app, sessionId, business.id, 2025);

    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe('no_data');
  });
});
