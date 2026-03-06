// Enable pg-boss for this test file before any imports
process.env['ENABLE_PGBOSS'] = 'true';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/app.js';
import { pool } from '../../src/db/client.js';
import { runJob, sendJob, withTransactionalJob } from '../../src/jobs/boss.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer({ logger: false });
});

afterAll(async () => {
  await app.close();
});

describe('pg-boss infrastructure', () => {
  it('enqueues and runs a test job via runJob wrapper', async () => {
    const { promise, resolve } = Promise.withResolvers<string>();

    await app.boss.work(
      '__test-job',
      runJob(
        '__test-job',
        async (job) => {
          resolve(job.data.value);
        },
        app.log
      )
    );

    await sendJob(app.boss, '__test-job', { value: 'hello' });

    const result = await promise;
    expect(result).toBe('hello');
  });

  it('rolled-back transaction does NOT enqueue a job', async () => {
    const jobName = '__test-job';

    await withTransactionalJob(pool, app.boss, async (_tx, jobDb) => {
      await app.boss.send(jobName, { value: 'should-not-exist' }, { db: jobDb });
      throw new Error('intentional rollback');
    }).catch(() => {
      // Expected — the rollback is intentional
    });

    // Give pg-boss a moment to process any pending work
    await new Promise((r) => setTimeout(r, 500));

    const jobs = await app.boss.fetch(jobName);
    expect(jobs).toEqual([]);
  });
});
