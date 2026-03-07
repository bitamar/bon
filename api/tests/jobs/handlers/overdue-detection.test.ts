import { describe, expect, it, beforeEach } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { createOverdueDetectionHandler } from '../../../src/jobs/handlers/overdue-detection.js';
import { db } from '../../../src/db/client.js';
import { invoices } from '../../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { resetDb } from '../../utils/db.js';
import { createUser, createTestBusiness } from '../../utils/businesses.js';
import { makeLogger, makeJob } from '../../utils/jobs.js';

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0]!;
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0]!;
}

async function createInvoice(
  businessId: string,
  status: string,
  dueDate: string | null,
  isOverdue = false
) {
  const [row] = await db
    .insert(invoices)
    .values({
      businessId,
      documentType: 'tax_invoice',
      status: status as 'draft',
      dueDate,
      isOverdue,
    })
    .returning();
  return row!;
}

let logger: FastifyBaseLogger;
let businessId: string;

async function runHandler() {
  const handler = createOverdueDetectionHandler(logger);
  await handler(makeJob('overdue-detection'));
}

async function findInvoice(id: string) {
  const rows = await db.select().from(invoices).where(eq(invoices.id, id));
  return rows[0]!;
}

describe('overdue-detection handler', () => {
  beforeEach(async () => {
    await resetDb();
    logger = makeLogger();
    const user = await createUser();
    const biz = await createTestBusiness(user.id);
    businessId = biz.id;
  });

  it('marks past-due finalized invoices as overdue', async () => {
    const inv = await createInvoice(businessId, 'finalized', daysAgo(5));

    await runHandler();

    const updated = await findInvoice(inv.id);
    expect(updated.isOverdue).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ markedOverdue: 1, resetOverdue: 0 }),
      'overdue-detection: completed'
    );
  });

  it('does not mark invoices with future due dates', async () => {
    const inv = await createInvoice(businessId, 'sent', daysFromNow(10));

    await runHandler();

    const updated = await findInvoice(inv.id);
    expect(updated.isOverdue).toBe(false);
  });

  it('does not mark invoices with null due date', async () => {
    const inv = await createInvoice(businessId, 'finalized', null);

    await runHandler();

    const updated = await findInvoice(inv.id);
    expect(updated.isOverdue).toBe(false);
  });

  it('resets overdue flag for paid invoices', async () => {
    const inv = await createInvoice(businessId, 'paid', daysAgo(5), true);

    await runHandler();

    const updated = await findInvoice(inv.id);
    expect(updated.isOverdue).toBe(false);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ resetOverdue: 1 }),
      'overdue-detection: completed'
    );
  });

  it('resets overdue flag for cancelled invoices', async () => {
    const inv = await createInvoice(businessId, 'cancelled', daysAgo(5), true);

    await runHandler();

    const updated = await findInvoice(inv.id);
    expect(updated.isOverdue).toBe(false);
  });

  it('resets overdue flag for credited invoices', async () => {
    const inv = await createInvoice(businessId, 'credited', daysAgo(5), true);

    await runHandler();

    const updated = await findInvoice(inv.id);
    expect(updated.isOverdue).toBe(false);
  });

  it('does not re-mark already overdue invoices', async () => {
    await createInvoice(businessId, 'sent', daysAgo(3), true);

    await runHandler();

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ markedOverdue: 0 }),
      'overdue-detection: completed'
    );
  });
});
