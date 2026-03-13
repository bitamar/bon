import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { createOverdueDigestHandler } from '../../../src/jobs/handlers/overdue-digest.js';
import { db } from '../../../src/db/client.js';
import { invoices } from '../../../src/db/schema.js';
import { resetDb } from '../../utils/db.js';
import { createUser, createTestBusiness, addUserToBusiness } from '../../utils/businesses.js';
import { makeLogger, makeJob } from '../../utils/jobs.js';

vi.mock('../../../src/services/email-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/services/email-service.js')>();
  return {
    ...actual,
    emailService: { send: vi.fn() },
  };
});

import { emailService } from '../../../src/services/email-service.js';

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0]!;
}

type InvoiceStatus = (typeof invoices)['$inferInsert']['status'];

async function createInvoice(
  businessId: string,
  status: InvoiceStatus,
  dueDate: string | null,
  overrides: Partial<(typeof invoices)['$inferInsert']> = {}
) {
  const [row] = await db
    .insert(invoices)
    .values({
      businessId,
      documentType: 'tax_invoice',
      status,
      dueDate,
      isOverdue: true,
      documentNumber: overrides.documentNumber ?? null,
      customerName: overrides.customerName ?? null,
      totalInclVatMinorUnits: overrides.totalInclVatMinorUnits ?? 10000,
      ...overrides,
    })
    .returning();
  return row!;
}

let logger: FastifyBaseLogger;

async function runHandler() {
  const handler = createOverdueDigestHandler(logger);
  await handler(makeJob('overdue-digest'));
}

describe('overdue-digest handler', () => {
  beforeEach(async () => {
    await resetDb();
    logger = makeLogger();
    vi.mocked(emailService.send).mockReset();
  });

  it('sends digest email to business owner with overdue invoices', async () => {
    const user = await createUser({ name: 'David' });
    const biz = await createTestBusiness(user.id, { name: 'Acme Ltd' });
    await addUserToBusiness(user.id, biz.id, 'owner');

    await createInvoice(biz.id, 'finalized', daysAgo(5), {
      documentNumber: 'INV-001',
      customerName: 'Customer A',
      totalInclVatMinorUnits: 50000,
    });

    await runHandler();

    expect(emailService.send).toHaveBeenCalledOnce();
    const call = vi.mocked(emailService.send).mock.calls[0]![0];
    expect(call.to).toBe(user.email);
    expect(call.subject).toContain('1');
    expect(call.subject).toContain('Acme Ltd');
    expect(call.html).toContain('INV-001');
    expect(call.html).toContain('Customer A');
    expect(call.html).toContain('David');

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ emailsSent: 1, businessCount: 1, overdueCount: 1 }),
      'overdue-digest: completed'
    );
  });

  it('sends no email when no invoices are overdue', async () => {
    await runHandler();

    expect(emailService.send).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ emailsSent: 0 }),
      'overdue-digest: no overdue invoices'
    );
  });

  it('skips invoices that are not overdue', async () => {
    const user = await createUser();
    const biz = await createTestBusiness(user.id);
    await addUserToBusiness(user.id, biz.id, 'owner');

    // Paid invoice with isOverdue=false should not trigger digest
    await createInvoice(biz.id, 'paid', daysAgo(5), { isOverdue: false });

    await runHandler();

    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('groups invoices by business and sends one email per owner', async () => {
    const user1 = await createUser();
    const biz1 = await createTestBusiness(user1.id, { name: 'Business 1' });
    await addUserToBusiness(user1.id, biz1.id, 'owner');

    const user2 = await createUser();
    const biz2 = await createTestBusiness(user2.id, { name: 'Business 2' });
    await addUserToBusiness(user2.id, biz2.id, 'owner');

    await createInvoice(biz1.id, 'sent', daysAgo(3));
    await createInvoice(biz1.id, 'finalized', daysAgo(10));
    await createInvoice(biz2.id, 'partially_paid', daysAgo(1));

    await runHandler();

    expect(emailService.send).toHaveBeenCalledTimes(2);

    const calls = vi.mocked(emailService.send).mock.calls;
    const recipients = calls.map((c) => c[0].to);
    expect(recipients).toContain(user1.email);
    expect(recipients).toContain(user2.email);

    // Business 1 email should mention 2 invoices
    const biz1Call = calls.find((c) => c[0].to === user1.email);
    expect(biz1Call![0].subject).toContain('2');
  });

  it('continues sending to other businesses when one email fails', async () => {
    const user1 = await createUser();
    const biz1 = await createTestBusiness(user1.id);
    await addUserToBusiness(user1.id, biz1.id, 'owner');

    const user2 = await createUser();
    const biz2 = await createTestBusiness(user2.id);
    await addUserToBusiness(user2.id, biz2.id, 'owner');

    await createInvoice(biz1.id, 'finalized', daysAgo(5));
    await createInvoice(biz2.id, 'sent', daysAgo(3));

    vi.mocked(emailService.send)
      .mockRejectedValueOnce(new Error('SMTP failure'))
      .mockResolvedValueOnce(undefined);

    await runHandler();

    expect(emailService.send).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ ownerEmail: user1.email }),
      'overdue-digest: failed to send email'
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ emailsSent: 1 }),
      'overdue-digest: completed'
    );
  });

  it('skips business with no owners', async () => {
    const user = await createUser();
    const biz = await createTestBusiness(user.id);
    // No addUserToBusiness call — no owners

    await createInvoice(biz.id, 'finalized', daysAgo(5));

    await runHandler();

    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('sends to multiple owners of the same business', async () => {
    const user1 = await createUser();
    const biz = await createTestBusiness(user1.id);
    await addUserToBusiness(user1.id, biz.id, 'owner');

    const user2 = await createUser();
    await addUserToBusiness(user2.id, biz.id, 'owner');

    await createInvoice(biz.id, 'finalized', daysAgo(5));

    await runHandler();

    expect(emailService.send).toHaveBeenCalledTimes(2);
    const recipients = vi.mocked(emailService.send).mock.calls.map((c) => c[0].to);
    expect(recipients).toContain(user1.email);
    expect(recipients).toContain(user2.email);
  });
});
