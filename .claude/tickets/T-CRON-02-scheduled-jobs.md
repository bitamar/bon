# T-CRON-02 — Scheduled Maintenance Jobs

**Status**: 🟢 Ready (T-CRON-01 merged in b4a0d8d)
**Phase**: Cross-cutting
**Requires**: T-CRON-01 merged
**Blocks**: nothing

---

## What & Why

Three simple housekeeping cron jobs that keep the database clean. These have no external dependencies, no complex failure modes, and are fully idempotent. Grouped together because they're all simple, independent, and share the same pattern.

SHAAM token refresh is NOT here — it belongs to T12 (SHAAM abstraction) because it depends on the `business_shaam_credentials` table and the SHAAM OAuth2 flow.

---

## Jobs

### 1. Draft Cleanup

| | |
|---|---|
| Schedule | `0 3 * * *` (3:00 AM daily, Israel time) |
| What | Hard-delete draft invoices not updated in 30 days |
| Query | `DELETE FROM invoices WHERE status = 'draft' AND updated_at < NOW() - INTERVAL '30 days'` |
| Idempotent | Yes — age-based, running twice = same result |

### 2. Session Cleanup

| | |
|---|---|
| Schedule | `0 4 * * *` (4:00 AM daily, Israel time) |
| What | Delete expired sessions |
| Query | `DELETE FROM sessions WHERE expires_at < NOW()` |
| Idempotent | Yes — expiry-based |

### 3. Overdue Detection

| | |
|---|---|
| Schedule | `0 6 * * *` (6:00 AM daily, Israel time) |
| What | Mark invoices as overdue, reset flag when paid |
| Idempotent | Yes — flag-based |

**Overdue handler logic:**

```typescript
// 1. Mark newly overdue
UPDATE invoices SET is_overdue = true
WHERE status IN ('finalized', 'sent', 'partially_paid')
  AND due_date < CURRENT_DATE
  AND due_date IS NOT NULL
  AND is_overdue = false;

// 2. Reset flag for paid/cancelled/credited invoices
UPDATE invoices SET is_overdue = false
WHERE status IN ('paid', 'cancelled', 'credited') AND is_overdue = true;

// 3. (Future) Send digest email per business owner — log for now
```

---

## Architecture Notes (from review)

- **Registration**: Create `api/src/plugins/maintenance-jobs.ts` to register all three jobs (createQueue + schedule + work). Keep `app.ts` clean.
- **Use Drizzle ORM, not raw SQL**: pg-mem (used by tests) does not support raw SQL strings. All queries must use Drizzle's query builder with imports from `db/schema.ts`.
- **Handler factory pattern**: Follow the SHAAM handler pattern — export a `createXxxHandler(logger)` factory that returns the job handler function. The factory receives the logger; DB access uses the shared Drizzle instance.
- **Draft cleanup cascade**: Deleting invoices cascades to `invoice_items` via FK `onDelete: 'cascade'`. No extra cleanup needed.
- **Session cleanup index**: The `session_expires_idx` index on `sessions.expiresAt` ensures efficient deletion.

## Acceptance Criteria

- [ ] All three jobs registered with `boss.schedule()` in `Asia/Jerusalem` timezone
- [ ] Each handler in its own file under `api/src/jobs/handlers/`
- [ ] Each handler logs start/end/count of affected rows
- [ ] Handlers use Drizzle ORM (not raw SQL) for pg-mem test compatibility
- [ ] Overdue reset covers `paid`, `cancelled`, and `credited` statuses
- [ ] Tests for each handler (insert test data, run handler, verify correct rows affected)
- [ ] `npm run check` passes

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
