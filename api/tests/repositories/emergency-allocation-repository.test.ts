import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  insertEmergencyNumbers,
  findEmergencyNumbersByBusinessId,
  findAvailableCount,
  findUsedCount,
  consumeNext,
  findUnreportedUsed,
  markReported,
  deleteEmergencyNumber,
} from '../../src/repositories/emergency-allocation-repository.js';
import { resetDb } from '../utils/db.js';
import { createUser, createTestBusiness } from '../utils/businesses.js';

// ── helpers ──

async function seedBusiness() {
  const user = await createUser();
  return createTestBusiness(user.id);
}

async function seedInvoice(businessId: string) {
  const { db } = await import('../../src/db/client.js');
  const { invoices } = await import('../../src/db/schema.js');
  const [inv] = await db
    .insert(invoices)
    .values({
      businessId,
      documentType: 'tax_invoice',
      status: 'finalized',
      invoiceDate: '2026-03-01',
    })
    .returning();
  return inv!;
}

function makeNumbers(businessId: string, count: number) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => ({
    businessId,
    number: `EMG-${randomUUID()}-${i}`,
    acquiredAt: new Date(now.getTime() + i * 1000),
  }));
}

describe('emergency-allocation-repository', () => {
  let businessId: string;

  beforeEach(async () => {
    await resetDb();
    const biz = await seedBusiness();
    businessId = biz.id;
  });

  describe('insertEmergencyNumbers', () => {
    it('inserts multiple numbers', async () => {
      const data = makeNumbers(businessId, 3);
      const result = await insertEmergencyNumbers(data);
      expect(result).toHaveLength(3);
      expect(result[0]!.used).toBe(false);
      expect(result[0]!.reported).toBe(false);
    });

    it('skips duplicates on conflict', async () => {
      const data = makeNumbers(businessId, 2);
      await insertEmergencyNumbers(data);
      const result = await insertEmergencyNumbers(data);
      expect(result).toHaveLength(0);
    });

    it('returns empty array for empty input', async () => {
      const result = await insertEmergencyNumbers([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('findEmergencyNumbersByBusinessId', () => {
    it('returns all numbers for a business ordered by acquiredAt', async () => {
      const data = makeNumbers(businessId, 3);
      await insertEmergencyNumbers(data);
      const result = await findEmergencyNumbersByBusinessId(businessId);
      expect(result).toHaveLength(3);
      expect(result[0]!.number).toBe(data[0]!.number);
    });

    it('returns empty array when none exist', async () => {
      const result = await findEmergencyNumbersByBusinessId(businessId);
      expect(result).toHaveLength(0);
    });
  });

  describe('findAvailableCount / findUsedCount', () => {
    it('counts available and used numbers', async () => {
      const data = makeNumbers(businessId, 5);
      await insertEmergencyNumbers(data);

      const invoice = await seedInvoice(businessId);
      await consumeNext(businessId, invoice.id);

      const available = await findAvailableCount(businessId);
      const used = await findUsedCount(businessId);
      expect(available).toBe(4);
      expect(used).toBe(1);
    });
  });

  describe('consumeNext', () => {
    it('consumes the oldest available number', async () => {
      const data = makeNumbers(businessId, 3);
      await insertEmergencyNumbers(data);
      const invoice = await seedInvoice(businessId);

      const consumed = await consumeNext(businessId, invoice.id);
      expect(consumed).not.toBeNull();
      expect(consumed!.number).toBe(data[0]!.number);
      expect(consumed!.used).toBe(true);
      expect(consumed!.usedForInvoiceId).toBe(invoice.id);
    });

    it('returns null when pool is empty', async () => {
      const invoice = await seedInvoice(businessId);
      const consumed = await consumeNext(businessId, invoice.id);
      expect(consumed).toBeNull();
    });
  });

  describe('findUnreportedUsed / markReported', () => {
    it('finds unreported used numbers and marks them', async () => {
      const data = makeNumbers(businessId, 2);
      await insertEmergencyNumbers(data);
      const invoice = await seedInvoice(businessId);
      await consumeNext(businessId, invoice.id);

      const unreported = await findUnreportedUsed(businessId);
      expect(unreported).toHaveLength(1);

      await markReported(unreported.map((r) => r.id));

      const unreportedAfter = await findUnreportedUsed(businessId);
      expect(unreportedAfter).toHaveLength(0);
    });
  });

  describe('deleteEmergencyNumber', () => {
    it('deletes an unused number', async () => {
      const data = makeNumbers(businessId, 1);
      const [inserted] = await insertEmergencyNumbers(data);

      const deleted = await deleteEmergencyNumber(inserted!.id, businessId);
      expect(deleted).not.toBeNull();

      const remaining = await findEmergencyNumbersByBusinessId(businessId);
      expect(remaining).toHaveLength(0);
    });

    it('returns null for a used number', async () => {
      const data = makeNumbers(businessId, 1);
      await insertEmergencyNumbers(data);
      const invoice = await seedInvoice(businessId);
      const consumed = await consumeNext(businessId, invoice.id);

      const deleted = await deleteEmergencyNumber(consumed!.id, businessId);
      expect(deleted).toBeNull();
    });

    it('returns null for wrong business', async () => {
      const data = makeNumbers(businessId, 1);
      const [inserted] = await insertEmergencyNumbers(data);

      const otherBiz = await seedBusiness();
      const deleted = await deleteEmergencyNumber(inserted!.id, otherBiz.id);
      expect(deleted).toBeNull();
    });
  });
});
