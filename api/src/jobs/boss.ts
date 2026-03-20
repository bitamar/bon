import type { FastifyBaseLogger } from 'fastify';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { PgBoss } from 'pg-boss';
import type { Db, Job, SendOptions } from 'pg-boss';
import * as schema from '../db/schema.js';

// Job registry — the single source of truth for all background jobs.
// To add a new job:
//   1. Add the job name + payload type here
//   2. Create a handler in api/src/jobs/handlers/<job-name>.ts
//   3. Register the handler in the owning feature's plugin (e.g. boss.work('name', runJob(...)))
//   4. Enqueue with sendJob(boss, 'name', payload, { singletonKey, retryLimit, ... })
export interface JobPayloads {
  // On-demand jobs (enqueued by features)
  'send-invoice-email': { invoiceId: string; businessId: string; recipientEmail: string };
  'shaam-allocation-request': { invoiceId: string; businessId: string };
  'shaam-emergency-report': { businessId: string };
  'process-whatsapp-message': { conversationId: string; messageId: string };
  'send-whatsapp-reply': { conversationId: string; body: string; to: string };

  // Cron jobs (scheduled, no payload)
  'overdue-detection': Record<string, never>;
  // Enqueued by overdue-detection on success
  'overdue-digest': Record<string, never>;
  'draft-cleanup': Record<string, never>;
  'session-cleanup': Record<string, never>;
  'shaam-token-refresh': Record<string, never>;

  // Test-only (used by integration tests)
  '__test-job': { value: string };
}

export type JobName = keyof JobPayloads;

export function createBoss(connectionString: string): PgBoss {
  return new PgBoss({
    connectionString,
    schema: 'pgboss',
  });
}

export async function sendJob<N extends JobName>(
  boss: PgBoss,
  name: N,
  payload: JobPayloads[N],
  options?: SendOptions
): Promise<string | null> {
  return boss.send(name, payload as object, options);
}

export function runJob<N extends JobName>(
  name: N,
  handler: (job: Job<JobPayloads[N]>) => Promise<void>,
  logger: FastifyBaseLogger
): (job: Job<JobPayloads[N]>[]) => Promise<void> {
  return async (jobs: Job<JobPayloads[N]>[]) => {
    for (const job of jobs) {
      await processOne(name, handler, logger, job);
    }
  };
}

async function processOne<N extends JobName>(
  name: N,
  handler: (job: Job<JobPayloads[N]>) => Promise<void>,
  logger: FastifyBaseLogger,
  job: Job<JobPayloads[N]>
): Promise<void> {
  const start = Date.now();
  try {
    logger.info({ jobName: name, jobId: job.id }, 'job started');
    await handler(job);
    logger.info({ jobName: name, jobId: job.id, durationMs: Date.now() - start }, 'job completed');
  } catch (err: unknown) {
    logger.error(
      { jobName: name, jobId: job.id, durationMs: Date.now() - start, err },
      'job failed'
    );
    throw err;
  }
}

/** Wraps a pg.PoolClient into pg-boss's IDatabase interface */
export function clientToDb(client: pg.PoolClient): Db {
  return {
    async executeSql(text: string, values?: unknown[]) {
      const result = await client.query(text, values);
      return { rows: result.rows as object[] };
    },
  };
}

/**
 * Runs a callback inside a transaction where both Drizzle operations and
 * boss.send() execute on the same connection. If the callback throws,
 * the transaction rolls back and the job is never enqueued.
 *
 * Usage (in T-ARCH-08, T13, etc.):
 *   await withTransactionalJob(pool, boss, async (tx, jobDb) => {
 *     await tx.update(invoices).set({ status: 'sending' }).where(...);
 *     await boss.send('send-invoice-email', payload, { db: jobDb, singletonKey: invoiceId });
 *   });
 */
export async function withTransactionalJob(
  pool: pg.Pool,
  boss: PgBoss,
  callback: (tx: NodePgDatabase<typeof schema>, jobDb: Db) => Promise<void>
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tx = drizzle(client, { schema });
    const jobDb = clientToDb(client);
    await callback(tx, jobDb);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
