import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../env.js';
import type { WhatsAppService } from '../services/whatsapp/whatsapp-types.js';
import { MockWhatsAppClient } from '../services/whatsapp/mock-client.js';
import { TwilioWhatsAppClient } from '../services/whatsapp/twilio-client.js';

declare module 'fastify' {
  interface FastifyInstance {
    whatsapp: WhatsAppService;
  }
}

const whatsappPluginFn: FastifyPluginAsync = async (app) => {
  let service: WhatsAppService;

  switch (env.WHATSAPP_MODE) {
    case 'mock':
      service = new MockWhatsAppClient();
      break;
    case 'sandbox':
    case 'production':
      service = new TwilioWhatsAppClient(
        env.TWILIO_ACCOUNT_SID!,
        env.TWILIO_AUTH_TOKEN!,
        env.TWILIO_WHATSAPP_FROM!
      );
      break;
  }

  app.decorate('whatsapp', service);
  app.log.info({ whatsappMode: env.WHATSAPP_MODE }, 'WhatsApp service initialized');
};

export const whatsappPlugin = fp(whatsappPluginFn);
