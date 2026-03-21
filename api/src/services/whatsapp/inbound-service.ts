import type { FastifyBaseLogger } from 'fastify';
import type { PgBoss } from 'pg-boss';
import { findUserByPhone } from '../../repositories/user-repository.js';
import {
  upsertConversation,
  insertMessage,
  countRecentInboundMessages,
} from '../../repositories/whatsapp-repository.js';
import { sendJob } from '../../jobs/boss.js';
import { stripWhatsAppPrefix } from '../../lib/phone.js';
import type { WhatsAppService } from './whatsapp-types.js';

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_MESSAGES = 10;

export interface InboundMessageInput {
  messageSid: string;
  from: string;
  body: string;
  numMedia: number;
}

export async function handleInboundMessage(
  input: InboundMessageInput,
  whatsapp: WhatsAppService,
  boss: PgBoss | undefined,
  logger: FastifyBaseLogger
): Promise<void> {
  const { messageSid, from, body: bodyText, numMedia } = input;
  logger.info({ messageSid, from }, 'inbound WhatsApp message received');
  const e164Phone = stripWhatsAppPrefix(from);

  // Media-only: no text body + has media → reply with text-only message
  if (numMedia > 0 && !bodyText.trim()) {
    await whatsapp.sendMessage(e164Phone, 'סליחה, כרגע אני מטפל רק בהודעות טקסט.');
    return;
  }

  // If no body text at all (and no media), nothing to process
  if (!bodyText.trim()) {
    return;
  }

  // Resolve user by phone
  const user = await findUserByPhone(e164Phone);

  if (!user) {
    await whatsapp.sendMessage(
      e164Phone,
      'מספר זה לא מחובר לחשבון BON. הירשמו באפליקציה והוסיפו מספר טלפון בפרופיל.'
    );
    return;
  }

  // WhatsApp opt-out check
  if (!user.whatsappEnabled) {
    await whatsapp.sendMessage(e164Phone, 'WhatsApp מושבת בחשבון שלך. הפעל דרך הגדרות הפרופיל.');
    return;
  }

  // Resolve or create conversation
  const conversation = await upsertConversation({
    userId: user.id,
    phone: e164Phone,
    status: 'active',
    lastActivityAt: new Date(),
  });

  // Rate limiting: count inbound messages in last 60 seconds
  const recentCount = await countRecentInboundMessages(conversation.id, RATE_LIMIT_WINDOW_SECONDS);
  if (recentCount >= RATE_LIMIT_MAX_MESSAGES) {
    await whatsapp.sendMessage(e164Phone, 'לאט לאט — עדיין מעבד את ההודעה הקודמת');
    return;
  }

  // Insert message (idempotent via twilioSid unique constraint)
  const message = await insertMessage({
    conversationId: conversation.id,
    twilioSid: messageSid,
    direction: 'inbound',
    llmRole: 'user',
    body: bodyText,
    metadata: JSON.stringify({
      From: from,
      NumMedia: numMedia,
    }),
  });

  // Duplicate messageSid → no-op (already processed)
  if (!message) {
    return;
  }

  // Enqueue processing job
  if (boss) {
    await sendJob(
      boss,
      'process-whatsapp-message',
      {
        conversationId: conversation.id,
        messageId: message.id,
      },
      {
        retryLimit: 3,
        retryDelay: 30,
        retryBackoff: true,
      }
    );
  }
}
