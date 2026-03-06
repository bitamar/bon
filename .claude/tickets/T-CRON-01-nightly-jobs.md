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
- [ ] Error handling: jobs log errors but never crash the server
- [ ] Each job logs start/end/duration for observability
- [ ] Integration test: start boss, enqueue a test job, verify it runs and completes
- [ ] `npm run check` passes

---

## Architecture

### File Structure

```text
api/src/
├── jobs/
│   ├── boss.ts          # createBoss(), JobPayloads type map, typed send/work wrappers
│   └── handlers/        # Empty dir — handlers added by subsequent tickets
└── plugins/
    └── jobs.ts          # Fastify plugin: start boss, decorate app, graceful shutdown
```

### Type-Safe Job Registry

```typescript
// api/src/jobs/boss.ts
import PgBoss from 'pg-boss';

// Every job must be registered here with its payload type.
// Adding a handler without updating this map is a type error.
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
}

export type JobName = keyof JobPayloads;

export function createBoss(connectionString: string): PgBoss {
  return new PgBoss({
    connectionString,
    schema: 'pgboss',
  });
}
```

### Fastify Plugin

```typescript
// api/src/plugins/jobs.ts
export const jobsPlugin: FastifyPluginAsync = async (app) => {
  const boss = createBoss(app.config.DATABASE_URL);
  await boss.start();

  // Only starts the boss and decorates app.
  // Cron schedules and handlers are registered by their owning tickets
  // (T-CRON-02, T-ARCH-08, T12, T13, T14) — not here.

  app.decorate('boss', boss);
  app.addHook('onClose', async () => { await boss.stop(); });
};
```

### On-Demand Job Pattern (used by T-ARCH-08, T13, T14)

The pattern for async external calls (email, SHAAM) is always:

```text
1. BEGIN transaction
2. Update entity status to transitional state (e.g. 'sending')
3. boss.send(jobName, payload, { singletonKey })   ← inside transaction
4. COMMIT
5. Return 202 Accepted to client
```

pg-boss `singletonKey` prevents duplicate jobs for the same entity. pg-boss stores jobs in PostgreSQL so the enqueue participates in the transaction — if the transaction rolls back, the job is never enqueued.

**Important**: pg-boss must use the **same database connection/pool** as the application so that `boss.send()` inside a Drizzle transaction actually participates in that transaction. Verify this during implementation.

### Cron Schedule Pattern (used by T-CRON-02, T12)

```typescript
// Registered by each handler's ticket, not by this infra ticket
await boss.schedule('overdue-detection', '0 6 * * *', null, { tz: 'Asia/Jerusalem' });
await boss.work('overdue-detection', handleOverdueDetection);
```

All cron times are in `Asia/Jerusalem` timezone.

---

## What This Ticket Does NOT Include

- No business-logic handlers (those live in T-ARCH-08, T-CRON-02, T12, T13, T14)
- No cron schedule registration (T-CRON-02 does that)
- No schema migrations (pg-boss creates its own `pgboss` schema automatically)

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
