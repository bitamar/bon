import { describe, expect, it, beforeEach } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { createDraftCleanupHandler } from '../../../src/jobs/handlers/draft-cleanup.js';
import { db } from '../../../src/db/client.js';
import { invoices } from '../../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { resetDb } from '../../utils/db.js';
import { createUser, createTestBusiness } from '../../utils/businesses.js';
import { makeLogger, makeJob } from '../../utils/jobs.js';

type InvoiceStatus = (typeof invoices)['$inferInsert']['status'];

async function createInvoice(businessId: string, status: InvoiceStatus, updatedDaysAgo: number) {
  const updatedAt = new Date(Date.now() - updatedDaysAgo * 24 * 60 * 60 * 1000);
  const [row] = await db
    .insert(invoices)
    .values({
      businessId,
      documentType: 'tax_invoice',
      status,
      updatedAt,
      createdAt: updatedAt,
    })
    .returning();
  return row!;
}

let logger: FastifyBaseLogger;
let businessId: string;

async function runHandler() {
  const handler = createDraftCleanupHandler(logger);
  await handler(makeJob('draft-cleanup'));
}

describe('draft-cleanup handler', () => {
  beforeEach(async () => {
    await resetDb();
    logger = makeLogger();
    const user = await createUser();
    const biz = await createTestBusiness(user.id);
    businessId = biz.id;
  });

  it('deletes draft invoices older than 30 days', async () => {
    const old = await createInvoice(businessId, 'draft', 31);
    const recent = await createInvoice(businessId, 'draft', 5);

    await runHandler();

    const remaining = await db.select().from(invoices).where(eq(invoices.businessId, businessId));
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(recent.id);
    expect(remaining.some((r) => r.id === old.id)).toBe(false);
    expect(logger.info).toHaveBeenCalledWith({ count: 1 }, 'draft-cleanup: deleted stale drafts');
  });

  it('does not delete finalized invoices even if old', async () => {
    await createInvoice(businessId, 'finalized', 60);

    await runHandler();

    const remaining = await db.select().from(invoices).where(eq(invoices.businessId, businessId));
    expect(remaining).toHaveLength(1);
    expect(logger.info).toHaveBeenCalledWith({ count: 0 }, 'draft-cleanup: deleted stale drafts');
  });

  it('handles empty database gracefully', async () => {
    await runHandler();

    expect(logger.info).toHaveBeenCalledWith({ count: 0 }, 'draft-cleanup: deleted stale drafts');
  });
});
