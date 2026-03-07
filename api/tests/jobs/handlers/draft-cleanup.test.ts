import { describe, expect, it, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Job } from 'pg-boss';
import type { FastifyBaseLogger } from 'fastify';
import type { JobPayloads } from '../../../src/jobs/boss.js';
import { createDraftCleanupHandler } from '../../../src/jobs/handlers/draft-cleanup.js';
import { db } from '../../../src/db/client.js';
import { invoices } from '../../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { resetDb } from '../../utils/db.js';
import { createUser, createTestBusiness } from '../../utils/businesses.js';

function makeJob(): Job<JobPayloads['draft-cleanup']> {
  return { id: randomUUID(), name: 'draft-cleanup', data: {} } as Job<JobPayloads['draft-cleanup']>;
}

function makeLogger(): FastifyBaseLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    level: 'info',
    silent: vi.fn(),
  } as unknown as FastifyBaseLogger;
}

async function createInvoice(businessId: string, status: string, updatedDaysAgo: number) {
  const updatedAt = new Date(Date.now() - updatedDaysAgo * 24 * 60 * 60 * 1000);
  const [row] = await db
    .insert(invoices)
    .values({
      businessId,
      documentType: 'tax_invoice',
      status: status as 'draft',
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
  await handler(makeJob());
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
