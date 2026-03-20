import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import type { PgBoss } from 'pg-boss';
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

type InvoiceStatus = (typeof invoices)['$inferInsert']['status'];

async function createInvoice(
  businessId: string,
  status: InvoiceStatus,
  dueDate: string | null,
  isOverdue = false,
  overrides: Partial<typeof invoices.$inferInsert> = {}
) {
  const [row] = await db
    .insert(invoices)
    .values({
      businessId,
      documentType: 'tax_invoice',
      status,
      dueDate,
      isOverdue,
      ...overrides,
    })
    .returning();
  return row!;
}

vi.mock('../../../src/jobs/boss.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/jobs/boss.js')>();
  return { ...actual, sendJob: vi.fn() };
});

vi.mock('../../../src/services/whatsapp/notifications.js', () => ({
  sendOverdueNotifications: vi.fn(),
}));

import { sendJob } from '../../../src/jobs/boss.js';
import { sendOverdueNotifications } from '../../../src/services/whatsapp/notifications.js';

let logger: FastifyBaseLogger;
let businessId: string;
const mockBoss = {} as PgBoss;

async function runHandler() {
  const handler = createOverdueDetectionHandler(logger, mockBoss);
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
    vi.mocked(sendJob).mockReset();
    vi.mocked(sendOverdueNotifications).mockReset();
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

  it('enqueues overdue-digest after successful detection', async () => {
    await createInvoice(businessId, 'finalized', daysAgo(5));

    await runHandler();

    expect(sendJob).toHaveBeenCalledWith(mockBoss, 'overdue-digest', {});
  });

  it('calls sendOverdueNotifications for newly overdue invoices', async () => {
    const inv = await createInvoice(businessId, 'finalized', daysAgo(5), false, {
      documentNumber: 'INV-001',
      customerName: 'Test Customer',
    });

    await runHandler();

    expect(sendOverdueNotifications).toHaveBeenCalledWith(
      businessId,
      expect.arrayContaining([
        expect.objectContaining({
          id: inv.id,
          documentNumber: 'INV-001',
          customerName: 'Test Customer',
        }),
      ]),
      mockBoss,
      logger
    );
  });

  it('does not call sendOverdueNotifications when no new overdue invoices', async () => {
    await createInvoice(businessId, 'sent', daysFromNow(10));

    await runHandler();

    expect(sendOverdueNotifications).not.toHaveBeenCalled();
  });

  it('groups overdue invoices by business for notifications', async () => {
    const user2 = await createUser();
    const biz2 = await createTestBusiness(user2.id);

    await createInvoice(businessId, 'finalized', daysAgo(5));
    await createInvoice(biz2.id, 'sent', daysAgo(3));

    await runHandler();

    expect(sendOverdueNotifications).toHaveBeenCalledTimes(2);
  });
});
