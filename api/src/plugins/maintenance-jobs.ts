import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { runJob } from '../jobs/boss.js';
import { createDraftCleanupHandler } from '../jobs/handlers/draft-cleanup.js';
import { createSessionCleanupHandler } from '../jobs/handlers/session-cleanup.js';
import { createOverdueDetectionHandler } from '../jobs/handlers/overdue-detection.js';

const maintenanceJobsPluginFn: FastifyPluginAsync = async (app) => {
  if (!app.boss) {
    app.log.warn('maintenance-jobs: pg-boss unavailable, cron jobs not registered');
    return;
  }

  // Draft cleanup — 3:00 AM daily (Israel time)
  await app.boss.createQueue('draft-cleanup');
  await app.boss.schedule('draft-cleanup', '0 3 * * *', null, { tz: 'Asia/Jerusalem' });
  await app.boss.work(
    'draft-cleanup',
    runJob('draft-cleanup', createDraftCleanupHandler(app.log), app.log)
  );

  // Session cleanup — 4:00 AM daily (Israel time)
  await app.boss.createQueue('session-cleanup');
  await app.boss.schedule('session-cleanup', '0 4 * * *', null, { tz: 'Asia/Jerusalem' });
  await app.boss.work(
    'session-cleanup',
    runJob('session-cleanup', createSessionCleanupHandler(app.log), app.log)
  );

  // Overdue detection — 6:00 AM daily (Israel time)
  await app.boss.createQueue('overdue-detection');
  await app.boss.schedule('overdue-detection', '0 6 * * *', null, { tz: 'Asia/Jerusalem' });
  await app.boss.work(
    'overdue-detection',
    runJob('overdue-detection', createOverdueDetectionHandler(app.log), app.log)
  );

  app.log.info('maintenance-jobs: all 3 cron jobs registered');
};

export const maintenanceJobsPlugin = fp(maintenanceJobsPluginFn);
