import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '../../src/db/client.js';
import { businesses, users } from '../../src/db/schema.js';
import { randomInt, randomUUID } from 'node:crypto';
import {
  insertInvoice,
  findInvoiceById,
  updateInvoice,
  deleteInvoice,
  insertItems,
  deleteItemsByInvoiceId,
  findItemsByInvoiceId,
} from '../../src/repositories/invoice-repository.js';
import { resetDb } from '../utils/db.js';

describe('invoice-repository', () => {
  let businessId: string;

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
      unitPriceAgora: 5000,
      discountPercent: '0',
      vatRateBasisPoints: 1700,
      lineTotalAgora: 10000,
      vatAmountAgora: 1700,
      lineTotalInclVatAgora: 11700,
    };
  }

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
