import type { FastifyBaseLogger } from 'fastify';
import type { Job } from 'pg-boss';
import type { JobPayloads } from '../boss.js';
import { findOverdueInvoices } from '../../repositories/invoice-repository.js';
import { findBusinessById } from '../../repositories/business-repository.js';
import { findBusinessOwnerEmails } from '../../repositories/user-business-repository.js';
import {
  emailService,
  buildOverdueDigestHtml,
  buildOverdueDigestSubject,
  type OverdueInvoiceSummary,
} from '../../services/email-service.js';

const MS_PER_DAY = 86_400_000;

/** Calendar-day difference in Asia/Jerusalem, independent of host timezone. */
export function computeDaysOverdue(dueDate: string): number {
  // Get today's calendar date in Israel
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const [tY, tM, tD] = todayStr.split('-').map(Number) as [number, number, number];
  const todayUtc = Date.UTC(tY, tM - 1, tD);

  // Parse the due date as a calendar date (UTC to avoid DST shifts)
  const [dY, dM, dD] = dueDate.split('-').map(Number) as [number, number, number];
  const dueUtc = Date.UTC(dY, dM - 1, dD);

  return Math.floor((todayUtc - dueUtc) / MS_PER_DAY);
}

/**
 * Creates the overdue-digest cron handler.
 * Sends a digest email to business owners listing all overdue invoices.
 * Runs after overdue-detection so the isOverdue flag is already set.
 */
export function createOverdueDigestHandler(
  logger: FastifyBaseLogger
): (job: Job<JobPayloads['overdue-digest']>) => Promise<void> {
  return async (_job) => {
    const overdueRows = await findOverdueInvoices();

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
        dueDate: row.dueDate,
        daysOverdue: computeDaysOverdue(row.dueDate),
      }));

      // Sort by days overdue descending (most overdue first)
      items.sort((a, b) => b.daysOverdue - a.daysOverdue);

      const subject = buildOverdueDigestSubject(business.name, items.length);

      for (const owner of owners) {
        try {
          const html = buildOverdueDigestHtml(business.name, owner.name, items);
          await emailService.send({ to: owner.email, subject, html });
          emailsSent++;
        } catch (err) {
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
