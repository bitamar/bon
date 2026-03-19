import type { FastifyBaseLogger } from 'fastify';
import type { Job, JobWithMetadata } from 'pg-boss';
import type { JobPayloads } from '../boss.js';
import { findInvoiceById, updateInvoice } from '../../repositories/invoice-repository.js';
import { findBusinessById } from '../../repositories/business-repository.js';
import { generateInvoicePdf } from '../../services/pdf-service.js';
import {
  emailService,
  buildInvoiceEmailSubject,
  buildInvoiceEmailHtml,
} from '../../services/email-service.js';
import { serializeInvoice } from '../../lib/invoice-serializers.js';

/**
 * Creates the send-invoice-email job handler.
 * Called by pg-boss after the route enqueues the job transactionally.
 *
 * Flow:
 *   1. Load invoice (skip if missing or no longer in 'sending' state)
 *   2. Generate PDF (cached if available)
 *   3. Send email via Resend
 *   4. Update status to 'sent' with sentAt timestamp
 *
 * On exhaustion (all retries failed):
 *   - Status reverts to 'finalized' so the user can retry
 */
export function createSendInvoiceEmailHandler(
  logger: FastifyBaseLogger
): (job: Job<JobPayloads['send-invoice-email']>) => Promise<void> {
  return async (job) => {
    const { invoiceId, businessId, recipientEmail } = job.data;
    const meta = job as Partial<JobWithMetadata<JobPayloads['send-invoice-email']>>;
    // retryCount is 0-based, so attempt 1 = first try. With retryLimit: 3 there
    // are 4 total attempts (1 initial + 3 retries). The final retry is when
    // attemptNumber (retryCount + 1) exceeds retryLimit.
    const attemptNumber = (meta.retryCount ?? 0) + 1;
    const isLastAttempt = attemptNumber > (meta.retryLimit ?? 3);

    logger.info({ invoiceId, businessId, attemptNumber }, 'send-invoice-email started');

    // 1. Load invoice — it must still be in 'sending' state
    const invoice = await findInvoiceById(invoiceId, businessId);
    if (!invoice) {
      logger.warn({ invoiceId }, 'send-invoice-email: invoice not found, skipping');
      return;
    }

    if (invoice.status !== 'sending') {
      logger.info(
        { invoiceId, status: invoice.status },
        'send-invoice-email: not in sending state, skipping'
      );
      return;
    }

    const business = await findBusinessById(businessId);
    if (!business) {
      logger.warn({ businessId }, 'send-invoice-email: business not found, skipping');
      return;
    }

    try {
      // 2. Generate PDF
      const { pdf, filename } = await generateInvoicePdf(businessId, invoiceId);

      // 3. Send email
      const serializedInvoice = serializeInvoice(invoice);
      await emailService.send({
        to: recipientEmail,
        subject: buildInvoiceEmailSubject(serializedInvoice, business.name),
        html: buildInvoiceEmailHtml(serializedInvoice, business.name),
        attachments: [{ filename, content: pdf }],
      });

      // 4. Update status to 'sent'
      const now = new Date();
      await updateInvoice(invoiceId, businessId, {
        status: 'sent',
        sentAt: now,
        updatedAt: now,
      });

      logger.info({ invoiceId }, 'send-invoice-email: sent successfully');
    } catch (err: unknown) {
      logger.error({ err, invoiceId, attemptNumber }, 'send-invoice-email: delivery failed');

      // On last attempt, revert status so the user can retry
      if (isLastAttempt) {
        try {
          await updateInvoice(invoiceId, businessId, {
            status: 'finalized',
            updatedAt: new Date(),
          });
          logger.warn(
            { invoiceId },
            'send-invoice-email: retries exhausted, reverted to finalized'
          );
        } catch (revertErr: unknown) {
          logger.error(
            { err: revertErr, invoiceId, businessId, isLastAttempt, attemptNumber },
            'send-invoice-email: failed to revert status to finalized'
          );
        }
      }

      throw err; // let pg-boss handle retry
    }
  };
}
