import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { injectAuthed } from '../utils/inject.js';
import {
  createOwnerWithBusiness,
  createAuthedUser,
  createTestBusiness,
  addUserToBusiness,
  createUser,
} from '../utils/businesses.js';
import { setupIntegrationTest } from '../utils/server.js';
import { db } from '../../src/db/client.js';
import { invoices } from '../../src/db/schema.js';

// ── helpers ──

async function getPcn874(
  app: FastifyInstance,
  sessionId: string,
  businessId: string,
  year: number,
  month: number
) {
  return injectAuthed(app, sessionId, {
    method: 'GET',
    url: `/businesses/${businessId}/reports/pcn874?year=${year}&month=${month}`,
  });
}

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
      sequenceNumber: 1,
      sequenceGroup: 'tax_document',
      documentNumber: 'INV-0001',
      customerName: 'Test Customer',
      customerTaxId: '123456789',
      totalExclVatMinorUnits: 10000,
      vatMinorUnits: 1700,
      totalInclVatMinorUnits: 11700,
      ...overrides,
    })
    .returning();
  return inv!;
}

describe('routes/pcn874', () => {
  const ctx = setupIntegrationTest();

  // ── tests ──

  it('returns PCN874 file with correct headers for empty period', async () => {
    const { sessionId, business } = await createOwnerWithBusiness();
    const res = await getPcn874(ctx.app, sessionId, business.id, 2026, 3);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.headers['content-type']).toContain('charset=windows-1255');
    expect(res.headers['content-disposition']).toContain('PCN874_');
    expect(res.headers['content-disposition']).toContain('_202603.txt');

    const body = res.body;
    const lines = body.split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(2); // opening + closing
    expect(lines[0]).toMatch(/^O/);
    expect(lines[1]).toMatch(/^X000000000/);
  });

  it('generates detail records for invoices in the period', async () => {
    const { sessionId, business } = await createOwnerWithBusiness();

    await createFinalized(business.id, {
      invoiceDate: '2026-02-15',
      sequenceNumber: 1,
      customerTaxId: '515036694',
      totalExclVatMinorUnits: 50000,
      vatMinorUnits: 8500,
      totalInclVatMinorUnits: 58500,
    });

    await createFinalized(business.id, {
      documentType: 'credit_note',
      sequenceGroup: 'credit_note',
      invoiceDate: '2026-02-20',
      sequenceNumber: 1,
      documentNumber: 'CN-0001',
      customerTaxId: '515036694',
      totalExclVatMinorUnits: 10000,
      vatMinorUnits: 1700,
      totalInclVatMinorUnits: 11700,
    });

    const res = await getPcn874(ctx.app, sessionId, business.id, 2026, 2);
    expect(res.statusCode).toBe(200);

    const lines = res.body.split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(4); // opening + 2 detail + closing

    // Opening record: check record count
    expect(lines[0]).toMatch(/^O/);
    expect(lines[0]).toMatch(/000000002$/);

    // First detail: tax_invoice, positive
    expect(lines[1]).toMatch(/^S01/);
    expect(lines[1]).toContain('515036694');
    expect(lines[1]).toContain('+00000050000');

    // Second detail: credit_note, negative
    expect(lines[2]).toMatch(/^S11/);
    expect(lines[2]).toContain('-00000010000');

    // Closing record
    expect(lines[3]).toBe('X000000002');
  });

  it('returns 422 for exempt_dealer businesses', async () => {
    const { user, sessionId } = await createAuthedUser();
    const business = await createTestBusiness(user.id, { businessType: 'exempt_dealer' });
    await addUserToBusiness(user.id, business.id, 'owner');

    const res = await getPcn874(ctx.app, sessionId, business.id, 2026, 3);
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'exempt_dealer_no_vat' });
  });

  it('returns 400 for invalid month', async () => {
    const { sessionId, business } = await createOwnerWithBusiness();
    const res = await getPcn874(ctx.app, sessionId, business.id, 2026, 13);
    expect(res.statusCode).toBe(400);
  });

  it('excludes draft invoices', async () => {
    const { sessionId, business } = await createOwnerWithBusiness();

    await createFinalized(business.id, {
      status: 'draft',
      invoiceDate: '2026-03-10',
    });

    const res = await getPcn874(ctx.app, sessionId, business.id, 2026, 3);
    expect(res.statusCode).toBe(200);

    const lines = res.body.split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(2); // only opening + closing — draft excluded
  });

  it('rejects non-member with 404', async () => {
    const { sessionId } = await createAuthedUser();
    const owner = await createUser();
    const business = await createTestBusiness(owner.id);
    await addUserToBusiness(owner.id, business.id, 'owner');

    const res = await getPcn874(ctx.app, sessionId, business.id, 2026, 3);
    expect(res.statusCode).toBe(404);
  });
});
