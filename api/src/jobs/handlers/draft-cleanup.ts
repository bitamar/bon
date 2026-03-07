import type { FastifyBaseLogger } from 'fastify';
import { and, eq, lt, sql } from 'drizzle-orm';
import type { Job } from 'pg-boss';
import type { JobPayloads } from '../boss.js';
import { db } from '../../db/client.js';
import { invoices } from '../../db/schema.js';

const STALE_DAYS = 30;

/**
 * Creates the draft-cleanup cron handler.
 * Hard-deletes draft invoices not updated in 30 days.
 * Cascade on invoice_items FK handles line item cleanup automatically.
 */
export function createDraftCleanupHandler(
  logger: FastifyBaseLogger
): (job: Job<JobPayloads['draft-cleanup']>) => Promise<void> {
  return async (_job) => {
    const cutoff = sql`NOW() - INTERVAL '${sql.raw(String(STALE_DAYS))} days'`;

    const deleted = await db
      .delete(invoices)
      .where(and(eq(invoices.status, 'draft'), lt(invoices.updatedAt, cutoff)))
      .returning({ id: invoices.id });

    logger.info({ count: deleted.length }, 'draft-cleanup: deleted stale drafts');
  };
}
