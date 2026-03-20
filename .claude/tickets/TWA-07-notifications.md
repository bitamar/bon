# TWA-07: Proactive Outbound Notifications

## Status: ⬜ Not started

## Summary

Templated Hebrew WhatsApp notifications triggered by existing system events: invoice sent, payment received, invoice overdue. No LLM involved — these are simple formatted messages enqueued as `send-whatsapp-reply` jobs. Only sent within the WhatsApp 24-hour messaging window.

## Why

Proactive notifications are the "push" side of WhatsApp. Users shouldn't have to open BON to know a payment came in or an invoice is overdue. These messages create daily touchpoints that make WhatsApp the primary interface. Notifications are sent to the **user's phone** (from `users.phone`).

## Scope

### Notification Service

1. **`api/src/services/whatsapp/notifications.ts`**:
   ```typescript
   async function notifyBusinessUsersViaWhatsApp(
     businessId: string,
     template: NotificationTemplate,
     data: Record<string, string>,
     boss: PgBoss
   ): Promise<void>
   ```
   - Look up all users with `owner` or `admin` role for this business (via `user_businesses`)
   - For each user with a phone number set (`users.phone`):
     - Check `users.whatsappEnabled` — if `false` → skip silently
     - Look up their `whatsapp_conversations` by `userId`
     - If no conversation exists (user never texted BON) → skip silently
     - If conversation is `blocked` → skip silently
     - **24-hour window check**: If `conversation.lastActivityAt` is older than 24 hours → skip silently. WhatsApp Business API only allows free-form messages within 24 hours of the user's last inbound message. Messages outside this window would fail with Twilio error 63016. (Future: register Twilio Content Templates to send outside the window.)
     - Format message from template + data
     - Enqueue `send-whatsapp-reply` job
   - This means multiple owners/admins can all receive notifications for the same business event

2. **Templates** — Simple string interpolation, not a template engine:
   ```typescript
   const TEMPLATES = {
     invoice_sent: 'החשבונית {documentNumber} ל{customerName} נשלחה בהצלחה ✓',
     payment_received: 'תשלום ₪{amount} התקבל עבור {documentNumber} ✓',
     invoice_overdue: '⚠️ חשבונית {documentNumber} ל{customerName} — {days} ימים ללא תשלום',
     shaam_failed: '⚠️ בעיה עם הקצאת SHAAM לחשבונית {documentNumber} — {reason}',
   } as const;
   ```

### Integration Points (existing code, small additions)

3. **Invoice send** — The route handler calls `sendInvoice()` which enqueues a `send-invoice-email` job. The WhatsApp notification should be triggered from the **route handler** in `api/src/routes/invoices.ts`, after `sendInvoice()` returns successfully:
   ```typescript
   // In the route handler, after: const result = await sendInvoice(...)
   await notifyBusinessUsersViaWhatsApp(businessId, 'invoice_sent', {
     documentNumber: invoice.documentNumber,
     customerName: invoice.customerName,
   }, app.boss);
   ```
   Do NOT add the notification inside the service function — keep it in the route to avoid coupling the service to WhatsApp.

4. **Payment recorded** — Payment recording lives in `invoice-service.ts` as `recordPayment()`. The notification must be triggered from the **route handler** in `api/src/routes/invoices.ts`, after `recordPayment()` returns:
   ```typescript
   // In the route handler, after: const result = await recordPayment(...)
   await notifyBusinessUsersViaWhatsApp(businessId, 'payment_received', {
     amount: formatCurrency(payment.amountMinorUnits),
     documentNumber: result.invoice.documentNumber,
   }, app.boss);
   ```

5. **Overdue detection** (`api/src/jobs/handlers/overdue-detection.ts`):
   After marking invoices overdue, for each newly overdue invoice:
   - Check if a notification was already sent today — query `whatsapp_messages` for outbound messages with `metadata @> '{"notificationType": "invoice_overdue", "invoiceId": "<id>"}'` created today. Use the `metadata` jsonb field for structured dedup instead of matching message text (text-matching breaks if template wording changes).
   - If not → enqueue notification with `metadata: { notificationType: 'invoice_overdue', invoiceId }` on the outbound message
   - Max 5 overdue notifications per business per day — sort by days overdue descending, take first 5 (prioritize most overdue invoices)

### Guards

- **No conversation → skip**: If a user never texted BON, they have no conversation. Don't create one proactively — WhatsApp Business API requires the user to initiate first.
- **24-hour window → skip**: If the conversation's `lastActivityAt` is older than 24 hours, skip. The WhatsApp Business API rejects free-form messages outside this window.
- **No phone → skip**: If a user has no phone set on their profile, skip them silently.
- **WhatsApp disabled → skip**: If `users.whatsappEnabled` is `false`, skip.
- **Blocked → skip**: User opted out via Twilio.
- **Only owners/admins**: Regular `user` role members don't receive business notifications.
- **Duplicate suppression**: For overdue notifications, check `metadata` jsonb field on recent outbound messages. For invoice_sent and payment_received, no dedup needed — they're one-time events.
- **Notification failures don't block the primary action**: `notifyBusinessUsersViaWhatsApp` catches all errors internally and logs. The invoice send / payment record must always succeed regardless of notification outcome.

### Tests

6. **`api/tests/services/whatsapp/notifications.test.ts`**:
   - Business owner with active conversation (within 24h) → job enqueued
   - Business with 2 admins → both get notified
   - User with `role: 'user'` → not notified
   - User with no phone set → skipped, no error
   - User with `whatsappEnabled: false` → skipped, no error
   - User with no conversation → no job enqueued, no error
   - User with blocked conversation → no job enqueued
   - User with conversation `lastActivityAt` older than 24h → no job enqueued (window expired)
   - Template interpolation produces correct Hebrew text
   - Notification failure doesn't propagate (caught and logged)

7. **`api/tests/jobs/handlers/overdue-detection.test.ts`** — Update existing test:
   - Verify notification enqueued for newly overdue invoices
   - Verify no notification when conversation doesn't exist
   - Verify daily dedup using `metadata` jsonb field (no repeat notification same day)
   - Verify max 5 per business per day, prioritized by days overdue

## Acceptance Criteria

- [ ] Invoice sent → all owners/admins of the business get WhatsApp notification (within 24h window)
- [ ] Payment received → all owners/admins of the business get WhatsApp notification (within 24h window)
- [ ] Overdue invoices → daily notification to owners/admins (max 5 per business per day, most overdue first)
- [ ] Users with `role: 'user'` do not receive notifications
- [ ] Users without a phone set are silently skipped
- [ ] Users with `whatsappEnabled: false` are silently skipped
- [ ] Users whose last WhatsApp activity is >24h ago are silently skipped
- [ ] No conversation exists → silent skip (no error)
- [ ] Blocked conversation → silent skip
- [ ] Notification failure doesn't block the primary action
- [ ] Overdue dedup uses `metadata` jsonb, not text matching
- [ ] No duplicate overdue notifications same day
- [ ] All notifications in Hebrew with correct formatting
- [ ] `npm run check` passes

## Size

~220 lines production code + ~180 lines tests. Small-medium ticket.

## Dependencies

- TWA-02 (WhatsApp service for sending)
- TWA-04 (conversation table for lookup)
- Independent of TWA-05/06 (no LLM involved)
