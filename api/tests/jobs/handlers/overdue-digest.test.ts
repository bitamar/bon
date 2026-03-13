import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import {
  createOverdueDigestHandler,
  computeDaysOverdue,
} from '../../../src/jobs/handlers/overdue-digest.js';
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

async function createOwnedBusiness(
  userOverrides?: Partial<Parameters<typeof createUser>[0]>,
  bizOverrides?: Partial<Parameters<typeof createTestBusiness>[1]>
) {
  const user = await createUser(userOverrides);
  const biz = await createTestBusiness(user.id, bizOverrides);
  await addUserToBusiness(user.id, biz.id, 'owner');
  return { user, biz };
}

describe('overdue-digest handler', () => {
  beforeEach(async () => {
    await resetDb();
    logger = makeLogger();
    vi.mocked(emailService.send).mockReset();
  });

  it('sends digest email to business owner with overdue invoices', async () => {
    const { user, biz } = await createOwnedBusiness({ name: 'David' }, { name: 'Acme Ltd' });

    await createInvoice(biz.id, 'finalized', daysAgo(5), {
      documentNumber: 'INV-001',
      customerName: 'Customer A',
      totalInclVatMinorUnits: 50000,
    });

    await runHandler();

    expect(emailService.send).toHaveBeenCalledOnce();
    const call = vi.mocked(emailService.send).mock.calls[0]![0];
    expect(call.to).toBe(user.email);
    expect(call.subject).toContain('חשבונית אחת באיחור');
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
    const { biz } = await createOwnedBusiness();

    // Paid invoice with isOverdue=false should not trigger digest
    await createInvoice(biz.id, 'paid', daysAgo(5), { isOverdue: false });

    await runHandler();

    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('groups invoices by business and sends one email per owner', async () => {
    const { user: user1, biz: biz1 } = await createOwnedBusiness(undefined, {
      name: 'Business 1',
    });
    const { user: user2, biz: biz2 } = await createOwnedBusiness(undefined, {
      name: 'Business 2',
    });

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
    const { biz: biz1 } = await createOwnedBusiness();
    const { biz: biz2 } = await createOwnedBusiness();

    await createInvoice(biz1.id, 'finalized', daysAgo(5));
    await createInvoice(biz2.id, 'sent', daysAgo(3));

    vi.mocked(emailService.send)
      .mockRejectedValueOnce(new Error('SMTP failure'))
      .mockResolvedValueOnce(undefined);

    await runHandler();

    expect(emailService.send).toHaveBeenCalledTimes(2);
    // One email fails, one succeeds — order is non-deterministic (Map iteration)
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ ownerEmail: expect.any(String) }),
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
    // No addUserToBusiness — no owners

    await createInvoice(biz.id, 'finalized', daysAgo(5));

    await runHandler();

    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('sends to multiple owners of the same business', async () => {
    const { user: user1, biz } = await createOwnedBusiness();
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

describe('computeDaysOverdue', () => {
  it('returns correct days for a fixed date regardless of host timezone', () => {
    // Mock Date to a fixed instant: 2026-03-13T10:00:00Z
    // In Asia/Jerusalem (UTC+2 in March) this is 2026-03-13 12:00
    const fixed = new Date('2026-03-13T10:00:00Z');
    vi.useFakeTimers({ now: fixed });

    // Due date was 5 days ago → 2026-03-08
    expect(computeDaysOverdue('2026-03-08')).toBe(5);
    // Due date is today → 0 days overdue
    expect(computeDaysOverdue('2026-03-13')).toBe(0);
    // Due date is tomorrow → -1 (not overdue)
    expect(computeDaysOverdue('2026-03-14')).toBe(-1);

    vi.useRealTimers();
  });

  it('handles timezone boundary: UTC midnight that is already next day in Jerusalem', () => {
    // 2026-03-13T23:00:00Z → in Jerusalem UTC+2: 2026-03-14 01:00
    const lateUtc = new Date('2026-03-13T23:00:00Z');
    vi.useFakeTimers({ now: lateUtc });

    // Jerusalem date is 2026-03-14, so 2026-03-08 is 6 days ago
    expect(computeDaysOverdue('2026-03-08')).toBe(6);
    // 2026-03-13 is yesterday in Jerusalem
    expect(computeDaysOverdue('2026-03-13')).toBe(1);

    vi.useRealTimers();
  });
});
