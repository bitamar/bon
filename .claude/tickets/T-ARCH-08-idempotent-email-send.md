# T-ARCH-08: Add idempotent send flow for invoice emails

## Problem

In `api/src/services/invoice-service.ts`, the `sendInvoice` function calls `emailService.send()` before persisting the invoice status update via `updateInvoice()`. If the DB update fails after the email is sent, the email was delivered but the invoice status stays unchanged, and a retry will re-send the email.

## Proposed Solution

1. Add a `'sending'` transitional status to the invoice status enum
2. Before sending, update the invoice to `status: 'sending'` with a unique `sendAttemptId`
3. Call `emailService.send()`
4. Update to `status: 'sent'` with `sentAt` timestamp
5. On failure, the `'sending'` state with the `sendAttemptId` allows retries to detect prior delivery and avoid duplicate sends

## Why this is a separate ticket

This requires schema changes (new status value, potentially a send-attempts/outbox table), a new migration, and state machine modifications — too large for an inline review fix.

## Found during

Review of T11 invoice send flow (PR branch `claude/review-t11-plan-mDv6S`).
