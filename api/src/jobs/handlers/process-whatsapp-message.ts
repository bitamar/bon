import type { FastifyBaseLogger } from 'fastify';
import type { Job, PgBoss } from 'pg-boss';
import type { JobPayloads } from '../boss.js';
import { sendJob } from '../boss.js';
import { findConversationById } from '../../repositories/whatsapp-repository.js';

/**
 * Stub handler for process-whatsapp-message.
 * TWA-05 will add LLM logic. For now, enqueues a placeholder reply
 * so the full pipeline is testable end-to-end.
 */
export function createProcessWhatsAppMessageHandler(
  logger: FastifyBaseLogger,
  boss: PgBoss
): (job: Job<JobPayloads['process-whatsapp-message']>) => Promise<void> {
  return async (job) => {
    const { conversationId, messageId } = job.data;

    const conversation = await findConversationById(conversationId);
    if (!conversation) {
      logger.warn(
        { conversationId, messageId },
        'process-whatsapp-message: conversation not found'
      );
      return;
    }

    logger.info({ conversationId, messageId }, 'process-whatsapp-message: received (stub handler)');

    // Enqueue a placeholder reply
    await sendJob(
      boss,
      'send-whatsapp-reply',
      {
        conversationId,
        body: 'קיבלתי את ההודעה שלך. תכונה זו בפיתוח.',
        to: conversation.phone,
      },
      {
        retryLimit: 5,
        retryDelay: 10,
        retryBackoff: true,
      }
    );
  };
}
