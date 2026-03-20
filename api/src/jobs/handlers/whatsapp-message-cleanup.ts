import type { FastifyBaseLogger } from 'fastify';
import type { Job } from 'pg-boss';
import type { JobPayloads } from '../boss.js';
import {
  deleteOldMessages,
  deleteExpiredPendingActions,
} from '../../repositories/whatsapp-repository.js';

const RETENTION_DAYS = 90;

/**
 * Creates the whatsapp-message-cleanup cron handler.
 * Deletes messages older than 90 days and expired pending actions.
 */
export function createWhatsappMessageCleanupHandler(
  logger: FastifyBaseLogger
): (job: Job<JobPayloads['whatsapp-message-cleanup']>) => Promise<void> {
  return async (_job) => {
    const deletedMessages = await deleteOldMessages(RETENTION_DAYS);
    const deletedActions = await deleteExpiredPendingActions();

    logger.info({ deletedMessages, deletedActions }, 'whatsapp-message-cleanup: completed');
  };
}
