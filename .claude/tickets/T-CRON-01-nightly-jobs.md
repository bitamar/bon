# T-CRON-01 — pg-boss Job Queue Infrastructure

**Status**: ⬜ Ready
**Phase**: Cross-cutting (prerequisite for all background work)
**Requires**: nothing (can start immediately)
**Blocks**: T-ARCH-08, T-CRON-02, T12

---

## What & Why

BON needs a background job system for both on-demand async work (email delivery, SHAAM allocation requests) and scheduled maintenance tasks (overdue detection, cleanup). This ticket sets up the **pg-boss infrastructure only** — no business-logic handlers. Once this merges, any ticket can enqueue or schedule jobs.

pg-boss was chosen because it uses PostgreSQL (already have it) — no new infrastructure (no Redis, no RabbitMQ).

---

## Acceptance Criteria

- [ ] `pg-boss` installed as dependency
- [ ] `api/src/jobs/boss.ts` — typed boss factory + job name/payload type map
- [ ] `api/src/plugins/jobs.ts` — Fastify plugin: start boss, decorate app, graceful shutdown
- [ ] Boss instance decorated on app (`app.boss`) for on-demand job enqueue from routes/services
- [ ] Graceful shutdown: `boss.stop()` on Fastify `onClose` hook
- [ ] Job type safety: `JobPayloads` interface maps job names → payload types
- [ ] Typed helper: `sendJob(boss, name, payload, options)` wrapper with `JobPayloads` type checking
- [ ] Job runner wrapper: `runJob(name, handler, logger)` catches uncaught exceptions from any handler, logs the error, and prevents boss worker crash — handlers don't implement their own try/catch
- [ ] Job timing middleware: the runner automatically logs job name, start time, duration, and outcome (success/error) — handlers don't implement their own timing
- [ ] Plugin skipped in test mode by default (no `app.boss` decorator) — enabled per-test via `ENABLE_PGBOSS=true` env var
- [ ] Integration test: set `ENABLE_PGBOSS=true`, start boss, enqueue a test job, verify it runs and completes via the runner
- [ ] Integration test: rolled-back transaction does NOT enqueue a job (transactional send)
- [ ] `npm run check` passes

---

## Architecture

### File Structure

```text
api/src/
├── jobs/
│   ├── boss.ts          # createBoss(), JobPayloads type map, typed send/work/run wrappers
│   └── handlers/        # Empty dir — handlers added by subsequent tickets
└── plugins/
    └── jobs.ts          # Fastify plugin: start boss, decorate app, graceful shutdown
```

### Type-Safe Job Registry

```typescript
// api/src/jobs/boss.ts
import PgBoss from 'pg-boss';
import type { FastifyBaseLogger } from 'fastify';

// Job registry — the single source of truth for all background jobs.
// To add a new job:
//   1. Add the job name + payload type here
//   2. Create a handler in api/src/jobs/handlers/<job-name>.ts
//   3. Register the handler in the owning feature's plugin (e.g. boss.work('name', runJob(...)))
//   4. Enqueue with sendJob(boss, 'name', payload, { singletonKey, retryLimit, ... })
export interface JobPayloads {
  // On-demand jobs (enqueued by features)
  'send-invoice-email': { invoiceId: string };
  'shaam-allocation-request': { invoiceId: string; businessId: string };
  'shaam-emergency-report': { businessId: string };

  // Cron jobs (scheduled, no payload)
  'overdue-detection': Record<string, never>;
  'draft-cleanup': Record<string, never>;
  'session-cleanup': Record<string, never>;
  'shaam-token-refresh': Record<string, never>;

  // Test-only (used by integration tests)
  '__test-job': { value: string };
}

export type JobName = keyof JobPayloads;
```

### Typed `sendJob` Wrapper

```typescript
export async function sendJob<N extends JobName>(
  boss: PgBoss,
  name: N,
  payload: JobPayloads[N],
  options?: PgBoss.SendOptions,
): Promise<string | null> {
  return boss.send(name, payload as object, options);
}
```

### `runJob` Wrapper (Error Catching + Timing)

Wraps a handler for use with `boss.work()`. Catches uncaught exceptions so the pg-boss worker never crashes. Logs job name, duration, and outcome. Accepts a logger instance (passed from the plugin at registration time, not the Fastify request logger).

```typescript
export function runJob<N extends JobName>(
  name: N,
  handler: (job: PgBoss.Job<JobPayloads[N]>) => Promise<void>,
  logger: FastifyBaseLogger,
): (job: PgBoss.Job<JobPayloads[N]>) => Promise<void> {
  return async (job) => {
    const start = Date.now();
    try {
      logger.info({ jobName: name, jobId: job.id }, 'job started');
      await handler(job);
      logger.info({ jobName: name, jobId: job.id, durationMs: Date.now() - start }, 'job completed');
    } catch (err: unknown) {
      logger.error({ jobName: name, jobId: job.id, durationMs: Date.now() - start, err }, 'job failed');
      throw err; // re-throw so pg-boss marks the job as failed and can retry
    }
  };
}
```

### `createBoss` Factory

```typescript
export function createBoss(connectionString: string): PgBoss {
  return new PgBoss({
    connectionString,
    schema: 'pgboss',
  });
}
```

### Fastify Plugin

pg-boss creates its own connection pool from the `connectionString` — it does NOT share the Drizzle `pg.Pool`. This means `boss.stop()` and `closeDb()` are independent; no shutdown ordering concern.

The plugin is **skipped in test mode by default** to avoid slowing down every test suite with pg-boss schema migrations and maintenance loops. Tests that need pg-boss set `ENABLE_PGBOSS=true` before importing.

```typescript
// api/src/plugins/jobs.ts
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../env.js';
import { createBoss } from '../jobs/boss.js';

declare module 'fastify' {
  interface FastifyInstance {
    boss: PgBoss;
  }
}

const jobsPluginFn: FastifyPluginAsync = async (app) => {
  // Skip in test mode unless explicitly enabled — pg-boss start() runs
  // schema migrations and a maintenance loop that slows down unrelated tests.
  if (env.NODE_ENV === 'test' && !process.env['ENABLE_PGBOSS']) {
    return;
  }

  const boss = createBoss(env.DATABASE_URL);
  await boss.start();

  // Only starts the boss and decorates app.
  // Cron schedules and handlers are registered by their owning tickets
  // (T-CRON-02, T-ARCH-08, T12, T13, T14) — not here.

  app.decorate('boss', boss);
  app.addHook('onClose', async () => { await boss.stop(); });
};

export const jobsPlugin = fp(jobsPluginFn);
```

Register in `app.ts` after `shaamPlugin`, before routes:

```typescript
await app.register(shaamPlugin);
await app.register(jobsPlugin);  // ← add here
```

### Transactional Enqueue — `withTransactionalJob` Helper

By default, `boss.send()` uses pg-boss's own connection pool — it does NOT participate in a Drizzle transaction. To make job enqueue atomic with a status update (the outbox pattern), we need both operations on the same database connection.

**Approach:** Use a raw `pg.PoolClient` directly — do NOT reach into Drizzle internals. The helper acquires a client from the app's `pg.Pool`, runs both Drizzle operations and `boss.send()` on it, and handles commit/rollback.

pg-boss's `send()` accepts a `db` option with the shape `{ executeSql(text: string, values: unknown[]): Promise<{ rows: object[]; rowCount: number }> }`. We wrap the raw `PoolClient` into this interface.

```typescript
// api/src/jobs/boss.ts

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';

/** Wraps a pg.PoolClient into pg-boss's { executeSql } interface */
export function clientToDb(client: pg.PoolClient): { executeSql: (text: string, values: unknown[]) => Promise<{ rows: object[]; rowCount: number }> } {
  return {
    async executeSql(text: string, values: unknown[]) {
      const result = await client.query(text, values);
      return { rows: result.rows as object[], rowCount: result.rowCount ?? 0 };
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
  callback: (
    tx: NodePgDatabase<typeof schema>,
    jobDb: { executeSql: (text: string, values: unknown[]) => Promise<{ rows: object[]; rowCount: number }> },
  ) => Promise<void>,
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
```

This approach:
- Avoids reaching into Drizzle internals (no `tx._.session.client`)
- Uses the same raw `PoolClient` for both Drizzle and pg-boss
- Naturally rolls back both the entity update and the job insert on error
- The app's `pg.Pool` is exported from `api/src/db/client.ts` (already exists as `pool`)

**Note:** The `pool` export must be added to `api/src/db/client.ts` (currently only `db` and `closeDb` are exported).

### On-Demand Job Pattern (used by T-ARCH-08, T13, T14)

The pattern for async external calls (email, SHAAM) is always:

```text
1. await withTransactionalJob(pool, boss, async (tx, jobDb) => {
2.   Update entity status to transitional state (e.g. 'sending') via tx
3.   boss.send(jobName, payload, { singletonKey, db: jobDb })
4. })  ← auto-commits or rolls back
5. Return 202 Accepted to client
```

pg-boss `singletonKey` prevents duplicate jobs for the same entity.

### Cron Schedule Pattern (used by T-CRON-02, T12)

```typescript
// Registered by each handler's ticket, not by this infra ticket
await boss.schedule('overdue-detection', '0 6 * * *', null, { tz: 'Asia/Jerusalem' });
await boss.work('overdue-detection', runJob('overdue-detection', handleOverdueDetection, app.log));
```

All cron times are in `Asia/Jerusalem` timezone.

---

## Integration Test Pattern

The jobs integration test must set `ENABLE_PGBOSS=true` and use the deferred-promise pattern to verify async job execution:

```typescript
// api/tests/jobs/boss.integration.test.ts
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

beforeAll(async () => { app = await buildServer({ logger: false }); });
afterAll(async () => { await app.close(); });

describe('pg-boss infrastructure', () => {
  it('enqueues and runs a test job via runJob wrapper', async () => {
    const { promise, resolve } = Promise.withResolvers<string>();

    await app.boss.work(
      '__test-job',
      runJob('__test-job', async (job) => { resolve(job.data.value); }, app.log),
    );

    await sendJob(app.boss, '__test-job', { value: 'hello' });

    const result = await withTimeout(promise, JOB_TIMEOUT_MS);
    expect(result).toBe('hello');
  });

  it('rolled-back transaction does NOT enqueue a job', async () => {
    await withTransactionalJob(pool, app.boss, async (_tx, jobDb) => {
      await sendJob(app.boss, '__test-job', { value: 'should-not-exist' }, { db: jobDb });
      throw new Error('intentional rollback');
    }).catch(() => {});

    // No sleep needed — rollback already happened synchronously,
    // so no job row exists in the DB. fetch() queries directly.
    const jobs = await app.boss.fetch('__test-job');
    expect(jobs).toEqual([]);
  });
});
```

---

## What This Ticket Does NOT Include

- No business-logic handlers (those live in T-ARCH-08, T-CRON-02, T12, T13, T14)
- No cron schedule registration (T-CRON-02 does that)
- No schema migrations (pg-boss creates its own `pgboss` schema automatically)

---

## Implementation Notes

### Export `pool` from `db/client.ts`

`withTransactionalJob` needs the raw `pg.Pool`. Add to `api/src/db/client.ts`:

```typescript
export { pool };  // needed by withTransactionalJob for transactional job enqueue
```

### `resetDb` update

Add `pgboss.job` truncation to `tests/utils/db.ts` so job state doesn't leak between tests (only when `ENABLE_PGBOSS` is set — the pgboss schema won't exist otherwise).

### `__test-job` in JobPayloads

The `__test-job` entry exists solely for integration tests. It is not used in production code.

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
