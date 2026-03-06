import { describe, expect, it, beforeEach } from 'vitest';
import { randomInt, randomUUID } from 'node:crypto';
import { db } from '../../src/db/client.js';
import { businesses, invoices, users } from '../../src/db/schema.js';
import {
  insertShaamAuditLog,
  findShaamAuditLogsByInvoiceId,
} from '../../src/repositories/shaam-audit-log-repository.js';
import { resetDb } from '../utils/db.js';

// ── helpers ──

async function seedInvoice() {
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
  const [invoice] = await db
    .insert(invoices)
    .values({
      businessId: biz!.id,
      documentType: 'tax_invoice',
      invoiceDate: '2026-01-15',
      status: 'finalized',
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return { businessId: biz!.id, invoiceId: invoice!.id };
}

function makeAuditData(businessId: string, invoiceId: string) {
  return {
    businessId,
    invoiceId,
    requestPayload: '{"test": true}',
    responsePayload: '{"status": "approved"}',
    httpStatus: 200,
    allocationNumber: 'ALLOC-001',
    errorCode: null,
    result: 'approved' as const,
    attemptNumber: 1,
  };
}

describe('shaam-audit-log-repository', () => {
  let businessId: string;
  let invoiceId: string;

  beforeEach(async () => {
    await resetDb();
    const seed = await seedInvoice();
    businessId = seed.businessId;
    invoiceId = seed.invoiceId;
  });

  describe('insertShaamAuditLog', () => {
    it('inserts and returns the audit log record', async () => {
      const data = makeAuditData(businessId, invoiceId);
      const result = await insertShaamAuditLog(data);

      expect(result).toMatchObject({
        businessId,
        invoiceId,
        requestPayload: '{"test": true}',
        result: 'approved',
        allocationNumber: 'ALLOC-001',
        attemptNumber: 1,
      });
      expect(result!.id).toBeDefined();
      expect(result!.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('findShaamAuditLogsByInvoiceId', () => {
    it('returns empty array when no logs exist', async () => {
      const result = await findShaamAuditLogsByInvoiceId(invoiceId);
      expect(result).toEqual([]);
    });

    it('returns logs ordered by createdAt ascending', async () => {
      await insertShaamAuditLog({
        ...makeAuditData(businessId, invoiceId),
        result: 'error',
        attemptNumber: 1,
      });
      await insertShaamAuditLog({
        ...makeAuditData(businessId, invoiceId),
        result: 'approved',
        attemptNumber: 2,
      });

      const logs = await findShaamAuditLogsByInvoiceId(invoiceId);
      expect(logs).toHaveLength(2);
      expect(logs[0]!.result).toBe('error');
      expect(logs[1]!.result).toBe('approved');
      expect(logs[0]!.createdAt.getTime()).toBeLessThanOrEqual(logs[1]!.createdAt.getTime());
    });
  });
});
