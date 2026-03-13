import type { FastifyBaseLogger } from 'fastify';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Job, PgBoss } from 'pg-boss';
import { sendJob, type JobPayloads } from '../boss.js';
import { db } from '../../db/client.js';
import { invoices } from '../../db/schema.js';

/**
 * Creates the overdue-detection cron handler.
 * Step 1: Mark invoices as overdue when due_date < today.
 * Step 2: Reset is_overdue flag for paid/cancelled/credited invoices.
 * Step 3: Enqueue overdue-digest job so emails are sent after detection.
 */
export function createOverdueDetectionHandler(
  logger: FastifyBaseLogger,
  boss: PgBoss
): (job: Job<JobPayloads['overdue-detection']>) => Promise<void> {
  return async (_job) => {
    // Step 1: Mark newly overdue
    const marked = await db
      .update(invoices)
      .set({ isOverdue: true })
      .where(
        and(
          inArray(invoices.status, ['finalized', 'sent', 'partially_paid']),
          sql`${invoices.dueDate} < CURRENT_DATE`,
          isNotNull(invoices.dueDate),
          eq(invoices.isOverdue, false)
        )
      )
      .returning({ id: invoices.id });

    // Step 2: Reset flag for resolved invoices
    const reset = await db
      .update(invoices)
      .set({ isOverdue: false })
      .where(
        and(
          inArray(invoices.status, ['paid', 'cancelled', 'credited']),
          eq(invoices.isOverdue, true)
        )
      )
      .returning({ id: invoices.id });

    logger.info(
      { markedOverdue: marked.length, resetOverdue: reset.length },
      'overdue-detection: completed'
    );

    // Step 3: Enqueue digest email after successful detection
    await sendJob(boss, 'overdue-digest', {});
    logger.info('overdue-detection: enqueued overdue-digest');
  };
}
