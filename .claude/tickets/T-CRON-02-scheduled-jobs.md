# T-CRON-02 — Scheduled Maintenance Jobs

**Status**: 🔒 Blocked (T-CRON-01 must merge first)
**Phase**: Cross-cutting
**Requires**: T-CRON-01 merged
**Blocks**: nothing

---

## What & Why

Three simple housekeeping cron jobs that keep the database clean. These have no external dependencies, no complex failure modes, and are fully idempotent. Grouped together because they're all simple, independent, and share the same pattern.

SHAAM token refresh is NOT here — it belongs to T12 (SHAAM abstraction) because it depends on the `business_shaam_credentials` table and the SHAAM OAuth2 flow.

Overdue detection is NOT here — it belongs to T15 (payments) because overdue logic depends on `dueDate` and payment tracking being complete.

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

// 2. Reset flag for paid invoices
UPDATE invoices SET is_overdue = false
WHERE status = 'paid' AND is_overdue = true;

// 3. (Future) Send digest email per business owner — log for now
```

---

## Acceptance Criteria

- [ ] All three jobs registered with `boss.schedule()` in `Asia/Jerusalem` timezone
- [ ] Each handler in its own file under `api/src/jobs/handlers/`
- [ ] Each handler logs start/end/count of affected rows
- [ ] Tests for each handler (insert test data, run handler, verify correct rows affected)
- [ ] `npm run check` passes

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
