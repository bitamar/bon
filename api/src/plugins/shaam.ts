import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../env.js';
import type { ShaamService } from '../services/shaam/types.js';
import { ShaamMockClient } from '../services/shaam/mock-client.js';
import { ShaamHttpClient } from '../services/shaam/http-client.js';

const SHAAM_SANDBOX_URL = 'https://ita-sandbox.taxes.gov.il/shaam/api';
const SHAAM_PRODUCTION_URL = 'https://ita.taxes.gov.il/shaam/api';

declare module 'fastify' {
  interface FastifyInstance {
    shaamService: ShaamService;
  }
}

const shaamPluginFn: FastifyPluginAsync = async (app) => {
  let service: ShaamService;

  switch (env.SHAAM_MODE) {
    case 'mock':
      service = new ShaamMockClient();
      break;
    case 'sandbox':
      service = new ShaamHttpClient(SHAAM_SANDBOX_URL);
      break;
    case 'production':
      service = new ShaamHttpClient(SHAAM_PRODUCTION_URL);
      break;
  }

  app.decorate('shaamService', service);
  app.log.info({ shaamMode: env.SHAAM_MODE }, 'SHAAM service initialized');
};

export const shaamPlugin = fp(shaamPluginFn);
