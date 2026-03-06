import type { FastifyPluginAsync } from 'fastify';
import type { PgBoss } from 'pg-boss';
import fp from 'fastify-plugin';
import { env } from '../env.js';
import { createBoss } from '../jobs/boss.js';

declare module 'fastify' {
  interface FastifyInstance {
    boss: PgBoss | undefined;
  }
}

const jobsPluginFn: FastifyPluginAsync = async (app) => {
  // Skip in test mode unless explicitly enabled — pg-boss start() runs
  // schema migrations and a maintenance loop that slows down unrelated tests.
  if (env.NODE_ENV === 'test' && !process.env['ENABLE_PGBOSS']) {
    app.decorate('boss', undefined);
    return;
  }

  const boss = createBoss(env.DATABASE_URL);
  await boss.start();

  app.decorate('boss', boss);
  app.addHook('onClose', async () => {
    await boss.stop();
  });

  app.log.info('pg-boss started');
};

export const jobsPlugin = fp(jobsPluginFn);
