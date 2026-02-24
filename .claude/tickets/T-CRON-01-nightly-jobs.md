# T-CRON-01 — Nightly Jobs Infrastructure & Scheduled Tasks

**Status**: 🔒 Blocked (T08-D must merge first)
**Phase**: Cross-cutting
**Requires**: T08-D merged (infrastructure + draft/session cleanup need only finalized invoices; overdue detection benefits from T15 but can use stub handler initially)
**Blocks**: nothing strictly, but T17 is absorbed into this ticket

**Dependency correction**: Was listed as requiring T15 (payments). Only Part 2 (overdue detection) benefits from T15. Parts 1, 3, 4 (infrastructure, draft cleanup, session cleanup) can ship immediately after T08-D. Split into two PRs accordingly.

---

## What & Why

BON needs a background job system for scheduled maintenance and compliance tasks. PLAN.md chose **pg-boss** (PostgreSQL-backed job queue) — no new infrastructure needed. This ticket sets up the pg-boss infrastructure and implements all nightly/scheduled jobs in one place, rather than scattering cron setup across multiple tickets.

**Absorbs T17** (Overdue Detection) — overdue detection is one nightly job among several. Having a separate ticket for it means pg-boss setup gets done in T17 but the other jobs are orphaned. Better to do all scheduled tasks together.

---

## Part 1: pg-boss Infrastructure

### Acceptance Criteria

- [ ] `pg-boss` installed and configured in `api/src/jobs/boss.ts`
- [ ] Boss instance starts with the Fastify server (plugin at `api/src/plugins/jobs.ts`)
- [ ] Graceful shutdown: `boss.stop()` on server close
- [ ] Job handlers registered at startup
- [ ] Cron schedule table (all times in Israel timezone, `Asia/Jerusalem`):

| Job Name | Schedule | Description |
|----------|----------|-------------|
| `overdue-detection` | `0 6 * * *` (6:00 AM daily) | Mark overdue invoices, send digest |
| `draft-cleanup` | `0 3 * * *` (3:00 AM daily) | Delete abandoned drafts |
| `session-cleanup` | `0 4 * * *` (4:00 AM daily) | Purge expired sessions |
| `shaam-token-refresh` | `*/15 * * * *` (every 15 min) | Refresh expiring SHAAM tokens |

- [ ] Each job has error handling: catch, log, do not crash the server
- [ ] Each job logs start/end/duration for observability
- [ ] `npm run check` passes

### Architecture Notes

```typescript
// api/src/jobs/boss.ts
import PgBoss from 'pg-boss';

export function createBoss(connectionString: string): PgBoss {
  return new PgBoss({
    connectionString,
    schema: 'pgboss', // separate schema, does not pollute public
  });
}

// api/src/plugins/jobs.ts — Fastify plugin
export const jobsPlugin: FastifyPluginAsync = async (app) => {
  const boss = createBoss(app.config.DATABASE_URL);
  await boss.start();

  // Register cron schedules
  await boss.schedule('overdue-detection', '0 6 * * *', null, { tz: 'Asia/Jerusalem' });
  await boss.schedule('draft-cleanup', '0 3 * * *', null, { tz: 'Asia/Jerusalem' });
  await boss.schedule('session-cleanup', '0 4 * * *', null, { tz: 'Asia/Jerusalem' });
  await boss.schedule('shaam-token-refresh', '*/15 * * * *', null, { tz: 'Asia/Jerusalem' });

  // Register handlers
  await boss.work('overdue-detection', handleOverdueDetection);
  await boss.work('draft-cleanup', handleDraftCleanup);
  await boss.work('session-cleanup', handleSessionCleanup);
  await boss.work('shaam-token-refresh', handleShaamTokenRefresh);

  app.addHook('onClose', async () => {
    await boss.stop();
  });

  app.decorate('boss', boss); // for on-demand job enqueue (e.g., SHAAM allocation)
};
```

**On-demand jobs** (not cron — enqueued by other features):
- `shaam-allocation-request` — enqueued by finalization when SHAAM is required (T13)
- `send-invoice-email` — enqueued by "send" action (T11)
- `generate-pdf` — enqueued by PDF request (T10)

These on-demand job handlers are NOT implemented in this ticket — they're registered by their respective tickets. This ticket only sets up the boss instance and the cron jobs.

---

## Part 2: Overdue Detection (absorbs T17)

### Acceptance Criteria

- [ ] Runs daily at 6:00 AM Israel time
- [ ] Finds all invoices where: `status IN ('finalized', 'sent', 'partially_paid')` AND `dueDate < NOW()` AND `dueDate IS NOT NULL` AND `isOverdue = false`
- [ ] Sets `isOverdue = true` on each (batch UPDATE, not one-by-one)
- [ ] Also resets `isOverdue = false` for invoices that were overdue but are now paid (handles edge case where payment recorded after overdue flag set)
- [ ] Sends digest email to each business owner with overdue invoices (requires T11 email infrastructure — if not yet available, log instead)
- [ ] Digest groups invoices by business, shows: invoice number, customer name, amount, days overdue
- [ ] Idempotent: running twice in the same day produces the same result

### Handler

File: `api/src/jobs/handlers/overdue-detection.ts`

```typescript
async function handleOverdueDetection(): Promise<void> {
  // 1. Batch-mark newly overdue
  await db.update(invoices)
    .set({ isOverdue: true, updatedAt: new Date() })
    .where(and(
      inArray(invoices.status, ['finalized', 'sent', 'partially_paid']),
      lt(invoices.dueDate, sql`CURRENT_DATE`),
      isNotNull(invoices.dueDate),
      eq(invoices.isOverdue, false),
    ));

  // 2. Reset overdue flag for paid invoices
  await db.update(invoices)
    .set({ isOverdue: false, updatedAt: new Date() })
    .where(and(
      eq(invoices.status, 'paid'),
      eq(invoices.isOverdue, true),
    ));

  // 3. Collect overdue invoices grouped by business for digest
  // 4. Send digest email per business owner (or log if email not available)
}
```

---

## Part 3: Draft Cleanup

### Acceptance Criteria

- [ ] Runs daily at 3:00 AM Israel time
- [ ] Deletes draft invoices where `updatedAt < NOW() - INTERVAL '30 days'` AND `status = 'draft'`
- [ ] Hard delete (cascade deletes items)
- [ ] Logs count of deleted drafts per business
- [ ] Does NOT delete drafts that have been touched in the last 30 days
- [ ] Idempotent

### Handler

File: `api/src/jobs/handlers/draft-cleanup.ts`

```typescript
async function handleDraftCleanup(): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const deleted = await db.delete(invoices)
    .where(and(
      eq(invoices.status, 'draft'),
      lt(invoices.updatedAt, cutoff),
    ))
    .returning({ id: invoices.id, businessId: invoices.businessId });

  if (deleted.length > 0) {
    logger.info({ count: deleted.length }, 'Cleaned up abandoned drafts');
  }
}
```

---

## Part 4: Session Cleanup

### Acceptance Criteria

- [ ] Runs daily at 4:00 AM Israel time
- [ ] Deletes sessions where `expiresAt < NOW()`
- [ ] Logs count of purged sessions
- [ ] Idempotent

### Notes

Sessions are already validated on access (expired sessions are rejected), so stale rows are not a security issue — they just waste space. This is a housekeeping job. Referenced in T-API-01 as a low-urgency item.

---

## Part 5: SHAAM Token Refresh

### Acceptance Criteria

- [ ] Runs every 15 minutes
- [ ] Finds all `business_shaam_credentials` rows where `tokenExpiresAt < NOW() + INTERVAL '5 minutes'`
- [ ] For each: attempt to refresh the token via SHAAM OAuth2 refresh flow
- [ ] On success: update `accessToken`, `refreshToken`, `tokenExpiresAt`
- [ ] On failure: log error, mark business as needing re-authorization (set a flag or send notification to business owner)
- [ ] Does not block or fail other businesses if one refresh fails

### Notes

This job depends on SHAAM integration (T12). The handler skeleton can be created in this ticket with a TODO, and the actual refresh logic wired in when T12 ships. Alternatively, defer the handler registration entirely until T12 — just have the cron schedule ready.

---

## Recommended PR Split

- **PR 1 — Infrastructure + draft/session cleanup** (can ship after T08-D): pg-boss setup, Fastify plugin, draft cleanup handler, session cleanup handler, cron schedule registration (overdue + SHAAM as empty stubs with `// TODO: implement in T15/T12`), tests
- **PR 2 — Overdue detection** (after T15 merges): overdue handler, digest email (or log if T11 not ready), overdue reset for paid invoices, tests

This split allows the infrastructure to ship early (Stream E) while the overdue handler waits for payments (T15).

---

## Test Strategy

- **pg-boss setup**: Note that pg-mem likely cannot support pg-boss (it uses advanced PG features like LISTEN/NOTIFY). For integration tests, either use a real Postgres instance or test the handlers directly without pg-boss (call the handler function, verify DB state). Prefer the latter for CI.
- **Overdue detection**: Unit test with pg-mem — insert invoices with various statuses and due dates, run handler function directly, verify `isOverdue` flags
- **Draft cleanup**: Unit test — insert old and recent drafts, run handler, verify only old ones deleted
- **Session cleanup**: Unit test — insert expired and valid sessions, run handler, verify only expired ones deleted
- **SHAAM token refresh**: Deferred to T12

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
