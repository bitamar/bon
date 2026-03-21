import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { env } from '../env.js';
import { validateTwilioSignature } from '../lib/twilio.js';
import { handleInboundMessage } from '../services/whatsapp/inbound-service.js';

const TwilioWebhookBody = z
  .object({
    MessageSid: z.string().optional(),
    From: z.string().optional(),
    Body: z.string().optional(),
    NumMedia: z.string().optional(),
  })
  .catchall(z.string());

export const whatsappWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.post('/webhooks/whatsapp', async (request, reply) => {
    const parsed = TwilioWebhookBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(200).send();
    }
    const body = parsed.data;

    // Signature verification (skip in mock mode)
    if (env.WHATSAPP_MODE !== 'mock') {
      const signature = request.headers['x-twilio-signature'] as string | undefined;
      const publicUrl = env.URL + '/webhooks/whatsapp';
      if (
        !validateTwilioSignature(
          signature,
          publicUrl,
          body as Record<string, string>,
          env.TWILIO_AUTH_TOKEN
        )
      ) {
        return reply.code(403).send();
      }
    }

    const messageSid = body['MessageSid'];
    const from = body['From'] ?? '';

    if (!messageSid || !from) {
      return reply.code(200).send();
    }

    await handleInboundMessage(
      {
        messageSid,
        from,
        body: body['Body'] ?? '',
        numMedia: Number.parseInt(body['NumMedia'] ?? '0', 10) || 0,
      },
      app.whatsapp,
      app.boss,
      request.log
    );

    return reply.code(200).send();
  });
};
