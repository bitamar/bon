import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../env.js';
import type { ShaamService } from '../services/shaam/types.js';
import { ShaamMockClient } from '../services/shaam/mock-client.js';
import { ShaamHttpClient } from '../services/shaam/http-client.js';
import { runJob } from '../jobs/boss.js';
import { createShaamTokenRefreshHandler } from '../jobs/handlers/shaam-token-refresh.js';

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

  // Register token refresh cron job (pg-boss must be available)
  if (app.boss) {
    await app.boss.schedule('shaam-token-refresh', '*/15 * * * *', null, {
      tz: 'Asia/Jerusalem',
    });
    await app.boss.work(
      'shaam-token-refresh',
      runJob('shaam-token-refresh', createShaamTokenRefreshHandler(app.log), app.log)
    );
    app.log.info('shaam-token-refresh cron job registered');
  }
};

export const shaamPlugin = fp(shaamPluginFn);
