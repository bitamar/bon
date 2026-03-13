import type { FastifyBaseLogger } from 'fastify';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Job } from 'pg-boss';
import type { JobPayloads } from '../boss.js';
import { db } from '../../db/client.js';
import { invoices } from '../../db/schema.js';
import { findBusinessById } from '../../repositories/business-repository.js';
import { findBusinessOwnerEmails } from '../../repositories/user-business-repository.js';
import {
  emailService,
  buildOverdueDigestHtml,
  buildOverdueDigestSubject,
  type OverdueInvoiceSummary,
} from '../../services/email-service.js';

const MS_PER_DAY = 86_400_000;

function computeDaysOverdue(dueDate: string): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const parts = dueDate.split('-').map(Number);
  const due = new Date(parts[0] ?? 0, (parts[1] ?? 1) - 1, parts[2] ?? 1);
  return Math.floor((today.getTime() - due.getTime()) / MS_PER_DAY);
}

const OVERDUE_STATUSES = ['finalized', 'sent', 'partially_paid'] as const;

/**
 * Creates the overdue-digest cron handler.
 * Sends a digest email to business owners listing all overdue invoices.
 * Runs after overdue-detection so the isOverdue flag is already set.
 */
export function createOverdueDigestHandler(
  logger: FastifyBaseLogger
): (job: Job<JobPayloads['overdue-digest']>) => Promise<void> {
  return async (_job) => {
    // Find all overdue invoices across all businesses
    const overdueRows = await db
      .select({
        id: invoices.id,
        businessId: invoices.businessId,
        documentNumber: invoices.documentNumber,
        customerName: invoices.customerName,
        totalInclVatMinorUnits: invoices.totalInclVatMinorUnits,
        dueDate: invoices.dueDate,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.isOverdue, true),
          inArray(invoices.status, [...OVERDUE_STATUSES]),
          isNotNull(invoices.dueDate)
        )
      );

    if (overdueRows.length === 0) {
      logger.info({ emailsSent: 0 }, 'overdue-digest: no overdue invoices');
      return;
    }

    // Group by businessId
    const byBusiness = new Map<string, typeof overdueRows>();
    for (const row of overdueRows) {
      let group = byBusiness.get(row.businessId);
      if (!group) {
        group = [];
        byBusiness.set(row.businessId, group);
      }
      group.push(row);
    }

    let emailsSent = 0;

    for (const [businessId, rows] of byBusiness) {
      const business = await findBusinessById(businessId);
      if (!business) continue;

      const owners = await findBusinessOwnerEmails(businessId);
      if (owners.length === 0) continue;

      const items: OverdueInvoiceSummary[] = rows.map((row) => ({
        documentNumber: row.documentNumber,
        customerName: row.customerName,
        totalInclVatMinorUnits: row.totalInclVatMinorUnits,
        dueDate: row.dueDate!,
        daysOverdue: computeDaysOverdue(row.dueDate!),
      }));

      // Sort by days overdue descending (most overdue first)
      items.sort((a, b) => b.daysOverdue - a.daysOverdue);

      const subject = buildOverdueDigestSubject(business.name, items.length);

      for (const owner of owners) {
        try {
          const html = buildOverdueDigestHtml(business.name, owner.name, items);
          await emailService.send({ to: owner.email, subject, html });
          emailsSent++;
        } catch (err: unknown) {
          logger.error(
            { businessId, ownerEmail: owner.email, err },
            'overdue-digest: failed to send email'
          );
        }
      }
    }

    logger.info(
      { emailsSent, businessCount: byBusiness.size, overdueCount: overdueRows.length },
      'overdue-digest: completed'
    );
  };
}
