import type { FastifyBaseLogger } from 'fastify';
import type { Job } from 'pg-boss';
import type { JobPayloads } from '../boss.js';
import type { WhatsAppService } from '../../services/whatsapp/whatsapp-types.js';
import { insertMessage } from '../../repositories/whatsapp-repository.js';

/**
 * Creates the send-whatsapp-reply job handler.
 * Sends a WhatsApp message via the WhatsApp service and stores the outbound message.
 */
export function createSendWhatsAppReplyHandler(
  whatsapp: WhatsAppService,
  logger: FastifyBaseLogger
): (job: Job<JobPayloads['send-whatsapp-reply']>) => Promise<void> {
  return async (job) => {
    const { conversationId, body, to } = job.data;

    const result = await whatsapp.sendMessage(to, body);

    if (result.status === 'sent') {
      await insertMessage({
        conversationId,
        twilioSid: result.messageSid,
        direction: 'outbound',
        llmRole: 'assistant',
        body,
      });
      logger.info({ conversationId, messageSid: result.messageSid }, 'whatsapp reply sent');
      return;
    }

    // Failed
    logger.error(
      { conversationId, error: result.error, retryable: result.retryable },
      'whatsapp reply failed'
    );

    if (result.retryable) {
      throw new Error(`WhatsApp send failed (retryable): ${result.error}`);
    }
    // Non-retryable: don't throw — pg-boss won't retry
  };
}
