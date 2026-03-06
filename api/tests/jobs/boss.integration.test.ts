// Enable pg-boss for this test file before any imports
process.env['ENABLE_PGBOSS'] = 'true';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/app.js';
import { pool } from '../../src/db/client.js';
import { runJob, sendJob, withTransactionalJob } from '../../src/jobs/boss.js';

const JOB_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Job did not complete within ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

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

    const result = await withTimeout(promise, JOB_TIMEOUT_MS);
    expect(result).toBe('hello');
  });

  it('rolled-back transaction does NOT enqueue a job', async () => {
    const jobName = '__test-job';

    await withTransactionalJob(pool, app.boss, async (_tx, jobDb) => {
      await sendJob(app.boss, jobName, { value: 'should-not-exist' }, { db: jobDb });
      throw new Error('intentional rollback');
    }).catch(() => {
      // Expected — the rollback is intentional
    });

    // No sleep needed — the rollback already happened synchronously,
    // so no job row exists in the DB. fetch() queries directly.
    const jobs = await app.boss.fetch(jobName);
    expect(jobs).toEqual([]);
  });
});
