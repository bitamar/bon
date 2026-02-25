import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '../../src/db/client.js';
import { businesses, customers, users } from '../../src/db/schema.js';
import { randomInt, randomUUID } from 'node:crypto';
import {
  insertInvoice,
  findInvoiceById,
  updateInvoice,
  deleteInvoice,
  insertItems,
  deleteItemsByInvoiceId,
  findItemsByInvoiceId,
  findInvoices,
  countInvoices,
} from '../../src/repositories/invoice-repository.js';
import { resetDb } from '../utils/db.js';

// ── helpers ──

async function seedBusinessWithOwner() {
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
  return biz!;
}

async function createTestInvoice(bizId: string, overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return insertInvoice({
    businessId: bizId,
    documentType: 'tax_invoice',
    invoiceDate: '2026-01-15',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function makeItem(invoiceId: string, position: number) {
  return {
    invoiceId,
    position,
    description: `Item ${position}`,
    quantity: '2',
    unitPriceMinorUnits: 5000,
    discountPercent: '0',
    vatRateBasisPoints: 1700,
    lineTotalMinorUnits: 10000,
    vatAmountMinorUnits: 1700,
    lineTotalInclVatMinorUnits: 11700,
  };
}

describe('invoice-repository', () => {
  let businessId: string;

  beforeEach(async () => {
    await resetDb();
    const biz = await seedBusinessWithOwner();
    businessId = biz.id;
  });

  // ── insertInvoice ──

  describe('insertInvoice', () => {
    it('creates an invoice and returns it', async () => {
      const invoice = await createTestInvoice(businessId);

      expect(invoice).not.toBeNull();
      expect(invoice!.businessId).toBe(businessId);
      expect(invoice!.documentType).toBe('tax_invoice');
      expect(invoice!.status).toBe('draft');
    });
  });

  // ── findInvoiceById ──

  describe('findInvoiceById', () => {
    it('returns the invoice when it exists', async () => {
      const created = await createTestInvoice(businessId);
      const found = await findInvoiceById(created!.id, businessId);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created!.id);
    });

    it('returns null for wrong businessId', async () => {
      const created = await createTestInvoice(businessId);
      const found = await findInvoiceById(created!.id, randomUUID());

      expect(found).toBeNull();
    });

    it('returns null for non-existent id', async () => {
      const found = await findInvoiceById(randomUUID(), businessId);
      expect(found).toBeNull();
    });
  });

  // ── updateInvoice ──

  describe('updateInvoice', () => {
    it('updates fields and returns the updated record', async () => {
      const created = await createTestInvoice(businessId);

      const updated = await updateInvoice(created!.id, businessId, {
        notes: 'Updated',
        updatedAt: new Date(),
      });

      expect(updated).not.toBeNull();
      expect(updated!.notes).toBe('Updated');
    });

    it('returns null for wrong businessId', async () => {
      const created = await createTestInvoice(businessId);
      const updated = await updateInvoice(created!.id, randomUUID(), {
        notes: 'Nope',
      });

      expect(updated).toBeNull();
    });
  });

  // ── deleteInvoice ──

  describe('deleteInvoice', () => {
    it('deletes the invoice and returns it', async () => {
      const created = await createTestInvoice(businessId);
      const deleted = await deleteInvoice(created!.id, businessId);

      expect(deleted).not.toBeNull();
      expect(deleted!.id).toBe(created!.id);

      const found = await findInvoiceById(created!.id, businessId);
      expect(found).toBeNull();
    });

    it('returns null for wrong businessId', async () => {
      const created = await createTestInvoice(businessId);
      const deleted = await deleteInvoice(created!.id, randomUUID());

      expect(deleted).toBeNull();
    });
  });

  // ── insertItems ──

  describe('insertItems', () => {
    it('inserts items and returns them', async () => {
      const invoice = await createTestInvoice(businessId);
      const items = await insertItems([makeItem(invoice!.id, 0), makeItem(invoice!.id, 1)]);

      expect(items).toHaveLength(2);
      expect(items[0]!.invoiceId).toBe(invoice!.id);
    });

    it('returns empty array when given empty input', async () => {
      const items = await insertItems([]);
      expect(items).toHaveLength(0);
    });
  });

  // ── findItemsByInvoiceId ──

  describe('findItemsByInvoiceId', () => {
    it('returns items ordered by position', async () => {
      const invoice = await createTestInvoice(businessId);
      await insertItems([
        makeItem(invoice!.id, 2),
        makeItem(invoice!.id, 0),
        makeItem(invoice!.id, 1),
      ]);

      const items = await findItemsByInvoiceId(invoice!.id);

      expect(items).toHaveLength(3);
      expect(items[0]!.position).toBe(0);
      expect(items[1]!.position).toBe(1);
      expect(items[2]!.position).toBe(2);
    });

    it('returns empty array for invoice with no items', async () => {
      const invoice = await createTestInvoice(businessId);
      const items = await findItemsByInvoiceId(invoice!.id);
      expect(items).toHaveLength(0);
    });
  });

  // ── deleteItemsByInvoiceId ──

  describe('deleteItemsByInvoiceId', () => {
    it('deletes all items for the invoice', async () => {
      const invoice = await createTestInvoice(businessId);
      await insertItems([makeItem(invoice!.id, 0), makeItem(invoice!.id, 1)]);

      await deleteItemsByInvoiceId(invoice!.id);

      const items = await findItemsByInvoiceId(invoice!.id);
      expect(items).toHaveLength(0);
    });
  });
});

// ── findInvoices / countInvoices ──

/** pg-mem returns date columns as Date objects even when mode:'string' is set in the schema.
 *  This helper normalises whatever comes back to a YYYY-MM-DD string for assertions. */
function toDateStr(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

describe('findInvoices / countInvoices', () => {
  let businessId: string;

  // ── helpers ──

  async function seedBiz() {
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
    return biz!;
  }

  async function seedCustomer(bizId: string) {
    const now = new Date();
    const [customer] = await db
      .insert(customers)
      .values({
        businessId: bizId,
        name: `Customer ${randomUUID()}`,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return customer!;
  }

  function baseFilters() {
    return {
      businessId,
      sort: 'createdAt:desc',
      offset: 0,
      limit: 50,
    };
  }

  beforeEach(async () => {
    await resetDb();
    const biz = await seedBiz();
    businessId = biz.id;
  });

  it('returns all invoices for a business', async () => {
    await createTestInvoice(businessId);
    await createTestInvoice(businessId);
    await createTestInvoice(businessId);

    const rows = await findInvoices(baseFilters());
    const total = await countInvoices(baseFilters());

    expect(rows).toHaveLength(3);
    expect(total).toBe(3);
  });

  it('filters by single status', async () => {
    await createTestInvoice(businessId, { status: 'draft' });
    await createTestInvoice(businessId, { status: 'finalized' });

    const rows = await findInvoices({ ...baseFilters(), status: ['draft'] });
    const total = await countInvoices({ ...baseFilters(), status: ['draft'] });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('draft');
    expect(total).toBe(1);
  });

  it('filters by multiple statuses', async () => {
    await createTestInvoice(businessId, { status: 'draft' });
    await createTestInvoice(businessId, { status: 'finalized' });
    await createTestInvoice(businessId, { status: 'paid' });

    const rows = await findInvoices({ ...baseFilters(), status: ['draft', 'finalized'] });
    const total = await countInvoices({ ...baseFilters(), status: ['draft', 'finalized'] });

    expect(rows).toHaveLength(2);
    expect(total).toBe(2);
    const statuses = rows.map((r) => r.status);
    expect(statuses).toContain('draft');
    expect(statuses).toContain('finalized');
  });

  it('filters by customerId', async () => {
    const customerA = await seedCustomer(businessId);
    const customerB = await seedCustomer(businessId);

    await createTestInvoice(businessId, { customerId: customerA.id });
    await createTestInvoice(businessId, { customerId: customerA.id });
    await createTestInvoice(businessId, { customerId: customerB.id });

    const rows = await findInvoices({ ...baseFilters(), customerId: customerA.id });
    const total = await countInvoices({ ...baseFilters(), customerId: customerA.id });

    expect(rows).toHaveLength(2);
    expect(total).toBe(2);
    expect(rows.every((r) => r.customerId === customerA.id)).toBe(true);
  });

  it('filters by date range', async () => {
    await createTestInvoice(businessId, { invoiceDate: '2026-01-01' });
    await createTestInvoice(businessId, { invoiceDate: '2026-02-15' });
    await createTestInvoice(businessId, { invoiceDate: '2026-03-31' });

    const rows = await findInvoices({
      ...baseFilters(),
      dateFrom: '2026-01-15',
      dateTo: '2026-03-01',
    });
    const total = await countInvoices({
      ...baseFilters(),
      dateFrom: '2026-01-15',
      dateTo: '2026-03-01',
    });

    expect(rows).toHaveLength(1);
    expect(toDateStr(rows[0]!.invoiceDate)).toBe('2026-02-15');
    expect(total).toBe(1);
  });

  it('text searches on documentNumber', async () => {
    await createTestInvoice(businessId, { status: 'finalized', documentNumber: 'INV-0042' });
    await createTestInvoice(businessId, { status: 'finalized', documentNumber: 'INV-0099' });
    await createTestInvoice(businessId, { status: 'finalized', documentNumber: 'REC-0001' });

    const rows = await findInvoices({ ...baseFilters(), q: 'INV' });
    const total = await countInvoices({ ...baseFilters(), q: 'INV' });

    expect(rows).toHaveLength(2);
    expect(total).toBe(2);
    expect(rows.every((r) => r.documentNumber?.startsWith('INV'))).toBe(true);
  });

  it('text searches on customerName', async () => {
    await createTestInvoice(businessId, { customerName: 'Acme Corp' });
    await createTestInvoice(businessId, { customerName: 'Beta Ltd' });
    await createTestInvoice(businessId, { customerName: 'Acme Holdings' });

    const rows = await findInvoices({ ...baseFilters(), q: 'Acme' });
    const total = await countInvoices({ ...baseFilters(), q: 'Acme' });

    expect(rows).toHaveLength(2);
    expect(total).toBe(2);
    expect(rows.every((r) => r.customerName?.includes('Acme'))).toBe(true);
  });

  it('paginates results with limit and offset', async () => {
    await createTestInvoice(businessId);
    await createTestInvoice(businessId);
    await createTestInvoice(businessId);
    await createTestInvoice(businessId);
    await createTestInvoice(businessId);

    const page1 = await findInvoices({ ...baseFilters(), offset: 0, limit: 2 });
    const page3 = await findInvoices({ ...baseFilters(), offset: 4, limit: 2 });
    const total = await countInvoices(baseFilters());

    expect(page1).toHaveLength(2);
    expect(page3).toHaveLength(1);
    expect(total).toBe(5);
  });

  it('sorts by invoiceDate descending', async () => {
    await createTestInvoice(businessId, { invoiceDate: '2026-01-10' });
    await createTestInvoice(businessId, { invoiceDate: '2026-03-20' });
    await createTestInvoice(businessId, { invoiceDate: '2026-02-05' });

    const rows = await findInvoices({ ...baseFilters(), sort: 'invoiceDate:desc' });

    expect(toDateStr(rows[0]!.invoiceDate)).toBe('2026-03-20');
    expect(toDateStr(rows[1]!.invoiceDate)).toBe('2026-02-05');
    expect(toDateStr(rows[2]!.invoiceDate)).toBe('2026-01-10');
  });

  it('sorts by dueDate ascending with nulls last', async () => {
    await createTestInvoice(businessId, { dueDate: '2026-03-01' });
    await createTestInvoice(businessId, { dueDate: null });
    await createTestInvoice(businessId, { dueDate: '2026-01-01' });

    const rows = await findInvoices({ ...baseFilters(), sort: 'dueDate:asc' });

    expect(toDateStr(rows[0]!.dueDate)).toBe('2026-01-01');
    expect(toDateStr(rows[1]!.dueDate)).toBe('2026-03-01');
    expect(rows[2]!.dueDate).toBeNull();
  });

  it('isolates invoices between businesses', async () => {
    const otherBiz = await seedBiz();

    await createTestInvoice(businessId);
    await createTestInvoice(businessId);
    await createTestInvoice(otherBiz.id);

    const rowsForBiz = await findInvoices(baseFilters());
    const rowsForOther = await findInvoices({ ...baseFilters(), businessId: otherBiz.id });
    const totalForBiz = await countInvoices(baseFilters());
    const totalForOther = await countInvoices({ ...baseFilters(), businessId: otherBiz.id });

    expect(rowsForBiz).toHaveLength(2);
    expect(totalForBiz).toBe(2);
    expect(rowsForOther).toHaveLength(1);
    expect(totalForOther).toBe(1);
    expect(rowsForBiz.every((r) => r.businessId === businessId)).toBe(true);
    expect(rowsForOther.every((r) => r.businessId === otherBiz.id)).toBe(true);
  });
});
