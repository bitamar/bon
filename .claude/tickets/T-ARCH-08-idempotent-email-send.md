# T-ARCH-08 — Async Email Delivery via Job Queue

**Status**: 🔄 In review (implementation complete, PR pending)
**Phase**: Cross-cutting
**Requires**: T-CRON-01 merged ✅
**Blocks**: nothing (nice-to-have improvement)

---

## Problem

In `invoice-service.ts`, `sendInvoice()` calls `emailService.send()` **synchronously** before persisting the status update. Two problems:

1. **Duplicate sends**: If the DB update fails after the email is sent, the email was delivered but the status stays `finalized`. A user retry re-sends the email.
2. **Blocking request**: The HTTP request blocks while waiting for the Resend API call (~1-3s). The user stares at a spinner.

---

## Solution: Outbox Pattern via pg-boss

pg-boss IS the outbox. The job payload is stored in PostgreSQL, so enqueuing inside a Drizzle transaction is atomic with the status update. No separate outbox table needed.

### Flow

```text
User clicks "Send"
     │
     ▼
POST /invoices/:id/send  (sync, fast)
  1. BEGIN transaction
  2. Validate invoice is finalized (not draft, not already sending/sent)
  3. UPDATE status = 'sending'
  4. boss.send('send-invoice-email', { invoiceId }, {
       singletonKey: invoiceId,    ← prevents duplicate jobs
       retryLimit: 3,
       retryDelay: 30,             ← seconds
       retryBackoff: true,         ← exponential: 30s, 60s, 120s
       expireInMinutes: 10,
     })
  5. COMMIT
  6. Return 202 Accepted  ← user sees "sending..." immediately
     │
     ▼
pg-boss worker (async, background)
  1. Pick up job
  2. Generate PDF (if not cached)
  3. Call emailService.send() with PDF attachment
  4. On success: UPDATE status = 'sent', sentAt = NOW()
  5. On failure: pg-boss retries automatically (3 attempts, exponential backoff)
  6. On exhaustion (all retries failed):
     - UPDATE status = 'finalized' (revert to pre-send state)
     - Log error for observability
     - (Future: notify business owner)
```

### Why `singletonKey` Replaces `sendAttemptId`

The original T-ARCH-08 proposed a `sendAttemptId` column to detect prior delivery. This is unnecessary with pg-boss:

- `singletonKey: invoiceId` ensures only one active job exists per invoice
- If a job is already queued/active for this invoice, `boss.send()` is a no-op
- No extra columns, no extra queries

### Why `'sending'` Status is Still Needed

Not for idempotency (pg-boss handles that), but for **UI state**:
- Frontend polls or receives a websocket update showing "שולח..." badge
- If the user refreshes, they see "sending" instead of ambiguous "finalized"
- Prevents the user from clicking "Send" again (button disabled when status is `'sending'`)

---

## Schema Changes

### 1. Add `'sending'` to invoice status enum

```sql
ALTER TYPE invoice_status ADD VALUE 'sending' AFTER 'finalized';
```

Status machine becomes:
```text
draft → finalized → sending → sent → paid
                  ↘ (retry exhausted) → finalized (reverted)
```

### 2. No new columns

The `sendAttemptId` column from the original proposal is dropped. pg-boss handles idempotency via `singletonKey`.

---

## Acceptance Criteria

- [ ] `'sending'` added to `INVOICE_STATUSES` in `types/src/invoices.ts`
- [ ] Migration: `ALTER TYPE invoice_status ADD VALUE 'sending'`
- [ ] `POST /invoices/:id/send` returns 202 and enqueues job (no longer calls email inline)
- [ ] Job handler in `api/src/jobs/handlers/send-invoice-email.ts`
- [ ] `singletonKey: invoiceId` prevents duplicate jobs
- [ ] Retry: 3 attempts, exponential backoff (30s, 60s, 120s)
- [ ] On exhaustion: status reverts to `finalized`, error logged
- [ ] Frontend: invoice detail shows "שולח..." when status is `'sending'`
- [ ] Frontend: send button disabled when status is `'sending'`
- [ ] Tests: happy path (job completes → status becomes 'sent'), failure path (retries exhausted → reverts to 'finalized')
- [ ] `npm run check` passes

---

## This Ticket Proves the Pattern

T-ARCH-08 is the first on-demand job. The pattern established here (transaction → enqueue → worker → status update) is reused by:
- **T13**: `shaam-allocation-request` (same pattern, different external service)
- **T14**: `shaam-emergency-report` (same pattern, batch variant)

Get this right and the SHAAM jobs are straightforward.

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
