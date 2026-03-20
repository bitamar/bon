import { timingSafeEqual, createHmac } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { env } from '../env.js';
import { findUserByPhone } from '../repositories/user-repository.js';
import {
  upsertConversation,
  insertMessage,
  countRecentInboundMessages,
} from '../repositories/whatsapp-repository.js';
import { sendJob } from '../jobs/boss.js';
import { stripWhatsAppPrefix } from '../lib/phone.js';

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_MESSAGES = 10;

/**
 * Validate Twilio webhook signature (HMAC-SHA1).
 * Uses the public-facing URL (env.URL) since behind a reverse proxy request.url differs.
 */
function validateTwilioSignature(
  signature: string | undefined,
  url: string,
  params: Record<string, string>
): boolean {
  if (!signature || !env.TWILIO_AUTH_TOKEN) return false;

  // Build the data string: URL + sorted params concatenated
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const expected = createHmac('sha1', env.TWILIO_AUTH_TOKEN).update(data).digest('base64');

  const sigBuf = Buffer.from(signature, 'base64');
  const expBuf = Buffer.from(expected, 'base64');
  if (sigBuf.length !== expBuf.length) return false;
  return timingSafeEqual(sigBuf, expBuf);
}

export const whatsappWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.post('/webhooks/whatsapp', async (request, reply) => {
    const body = request.body as Record<string, string>;

    // 1. Signature verification (skip in mock mode)
    if (env.WHATSAPP_MODE !== 'mock') {
      const signature = request.headers['x-twilio-signature'] as string | undefined;
      const publicUrl = env.URL + '/webhooks/whatsapp';
      if (!validateTwilioSignature(signature, publicUrl, body)) {
        return reply.code(403).send();
      }
    }

    // 2. Parse inbound fields
    const messageSid = body['MessageSid'];
    const from = body['From'] ?? '';
    const bodyText = body['Body'] ?? '';
    const numMedia = parseInt(body['NumMedia'] ?? '0', 10) || 0;

    if (!messageSid || !from) {
      return reply.code(200).send();
    }

    // 3. Media-only: no text body + has media → reply with text-only message
    if (numMedia > 0 && !bodyText.trim()) {
      const phone = stripWhatsAppPrefix(from);
      await app.whatsapp.sendMessage(phone, 'סליחה, כרגע אני מטפל רק בהודעות טקסט.');
      return reply.code(200).send();
    }

    // If no body text at all (and no media), nothing to process
    if (!bodyText.trim()) {
      return reply.code(200).send();
    }

    // 4. Resolve user by phone
    const e164Phone = stripWhatsAppPrefix(from);
    const user = await findUserByPhone(e164Phone);

    if (!user) {
      await app.whatsapp.sendMessage(
        e164Phone,
        'מספר זה לא מחובר לחשבון BON. הירשמו באפליקציה והוסיפו מספר טלפון בפרופיל.'
      );
      return reply.code(200).send();
    }

    // 5. WhatsApp opt-out check
    if (!user.whatsappEnabled) {
      await app.whatsapp.sendMessage(
        e164Phone,
        'WhatsApp מושבת בחשבון שלך. הפעל דרך הגדרות הפרופיל.'
      );
      return reply.code(200).send();
    }

    // 6. Resolve or create conversation
    const conversation = await upsertConversation({
      userId: user.id,
      phone: e164Phone,
      status: 'active',
      lastActivityAt: new Date(),
    });

    // 7. Rate limiting: count inbound messages in last 60 seconds
    const recentCount = await countRecentInboundMessages(
      conversation.id,
      RATE_LIMIT_WINDOW_SECONDS
    );
    if (recentCount >= RATE_LIMIT_MAX_MESSAGES) {
      await app.whatsapp.sendMessage(e164Phone, 'לאט לאט — עדיין מעבד את ההודעה הקודמת');
      return reply.code(200).send();
    }

    // 8. Insert message (idempotent via twilioSid unique constraint)
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
      return reply.code(200).send();
    }

    // 9. Enqueue processing job
    if (app.boss) {
      await sendJob(
        app.boss,
        'process-whatsapp-message',
        {
          conversationId: conversation.id,
          messageId: message.id,
        },
        {
          singletonKey: conversation.id,
          retryLimit: 3,
          retryDelay: 30,
          retryBackoff: true,
        }
      );
    }

    return reply.code(200).send();
  });
};
