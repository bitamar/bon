import type { FastifyBaseLogger } from 'fastify';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Job, PgBoss } from 'pg-boss';
import { sendJob, type JobPayloads } from '../boss.js';
import { db } from '../../db/client.js';
import { invoices } from '../../db/schema.js';
import { sendOverdueNotifications } from '../../services/whatsapp/notifications.js';

/**
 * Creates the overdue-detection cron handler.
 * Step 1: Mark invoices as overdue when due_date < today.
 * Step 2: Reset is_overdue flag for paid/cancelled/credited invoices.
 * Step 3: Send WhatsApp notifications for newly overdue invoices.
 * Step 4: Enqueue overdue-digest job so emails are sent after detection.
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
      .returning({
        id: invoices.id,
        businessId: invoices.businessId,
        documentNumber: invoices.documentNumber,
        customerName: invoices.customerName,
        dueDate: invoices.dueDate,
      });

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

    // Step 3: Send WhatsApp notifications for newly overdue invoices
    if (marked.length > 0) {
      const today = new Date();
      const byBusiness = new Map<
        string,
        Array<{
          id: string;
          documentNumber: string | null;
          customerName: string | null;
          daysOverdue: number;
        }>
      >();

      for (const inv of marked) {
        const daysOverdue = inv.dueDate
          ? Math.floor((today.getTime() - new Date(inv.dueDate).getTime()) / (24 * 60 * 60 * 1000))
          : 1;

        const list = byBusiness.get(inv.businessId) ?? [];
        list.push({
          id: inv.id,
          documentNumber: inv.documentNumber,
          customerName: inv.customerName,
          daysOverdue,
        });
        byBusiness.set(inv.businessId, list);
      }

      for (const [businessId, overdueInvoices] of byBusiness) {
        await sendOverdueNotifications(businessId, overdueInvoices, boss, logger);
      }
    }

    // Step 4: Enqueue digest email after successful detection
    await sendJob(boss, 'overdue-digest', {});
    logger.info('overdue-detection: enqueued overdue-digest');
  };
}
