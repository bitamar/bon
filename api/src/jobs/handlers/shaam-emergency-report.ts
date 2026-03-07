import type { FastifyBaseLogger } from 'fastify';
import type { Job } from 'pg-boss';
import type { JobPayloads } from '../boss.js';
import {
  findUnreportedUsed,
  markReported,
} from '../../repositories/emergency-allocation-repository.js';
import type { ShaamService } from '../../services/shaam/types.js';

/**
 * Creates the shaam-emergency-report handler.
 * Batch-reports used emergency numbers back to ITA when SHAAM recovers.
 */
export function createShaamEmergencyReportHandler(
  shaamService: ShaamService,
  logger: FastifyBaseLogger
): (job: Job<JobPayloads['shaam-emergency-report']>) => Promise<void> {
  return async (job) => {
    const { businessId } = job.data;

    logger.info({ businessId }, 'SHAAM emergency report job started');

    const unreported = await findUnreportedUsed(businessId);
    if (unreported.length === 0) {
      logger.info({ businessId }, 'SHAAM emergency report: no unreported numbers, skipping');
      return;
    }

    const usedNumbers = unreported.map((row) => ({
      number: row.number,
      invoiceId: row.usedForInvoiceId ?? '',
    }));

    if (shaamService.reportEmergencyUsage) {
      await shaamService.reportEmergencyUsage(businessId, usedNumbers);
    } else {
      logger.warn({ businessId }, 'SHAAM service does not implement reportEmergencyUsage');
    }

    await markReported(unreported.map((row) => row.id));

    logger.info(
      { businessId, count: unreported.length },
      'SHAAM emergency report: marked numbers as reported'
    );
  };
}
