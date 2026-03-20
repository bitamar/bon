# TWA-07: Proactive Outbound Notifications

## Status: ⬜ Not started

## Summary

Templated Hebrew WhatsApp notifications triggered by existing system events: invoice sent, payment received, invoice overdue. No LLM involved — these are simple formatted messages enqueued as `send-whatsapp-reply` jobs.

## Why

Proactive notifications are the "push" side of WhatsApp. Business owners shouldn't have to open BON to know a payment came in or an invoice is overdue. These messages create daily touchpoints that make WhatsApp the primary interface.

## Scope

### Notification Service

1. **`api/src/services/whatsapp/notifications.ts`**:
   ```typescript
   async function notifyBusinessViaWhatsApp(
     businessId: string,
     template: NotificationTemplate,
     data: Record<string, string>,
     boss: PgBoss
   ): Promise<void>
   ```
   - Looks up business phone from `businesses` table
   - Looks up conversation by phone from `whatsapp_conversations`
   - If no conversation exists (business owner never texted BON) → skip silently
   - If conversation is `blocked` → skip silently
   - Format message from template + data
   - Enqueue `send-whatsapp-reply` job

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

3. **Invoice send** — `sendInvoice()` in `invoice-service.ts` is **synchronous** (email sent inline, not queued via pg-boss). The notification must be triggered from the **route handler** in `api/src/routes/invoices.ts`, after `sendInvoice()` returns successfully:
   ```typescript
   // In the route handler, after: const result = await sendInvoice(...)
   await notifyBusinessViaWhatsApp(businessId, 'invoice_sent', {
     documentNumber: invoice.documentNumber,
     customerName: invoice.customerName,
   }, app.boss);
   ```
   Do NOT add the notification inside the service function — keep it in the route to avoid coupling the service to WhatsApp.

4. **Payment recorded** — There is no `payment-service.ts`. Payment recording lives in `invoice-service.ts` as `recordPayment()`. The notification must be triggered from the **route handler** in `api/src/routes/invoices.ts`, after `recordPayment()` returns:
   ```typescript
   // In the route handler, after: const result = await recordPayment(...)
   await notifyBusinessViaWhatsApp(businessId, 'payment_received', {
     amount: formatCurrency(payment.amountMinorUnits),
     documentNumber: result.invoice.documentNumber,
   }, app.boss);
   ```

5. **Overdue detection** (`api/src/jobs/handlers/overdue-detection.ts`):
   After marking invoices overdue, for each newly overdue invoice:
   - Check if a notification was already sent today (query `whatsapp_messages` for outbound message with matching text, created today)
   - If not → enqueue notification
   - Max 5 overdue notifications per business per day (don't spam)

### Guards

- **No conversation → skip**: If the business owner never texted BON, we don't have a conversation. Don't create one proactively — WhatsApp Business API requires the user to initiate first (24-hour messaging window).
- **Blocked → skip**: User opted out.
- **Duplicate suppression**: For overdue notifications, check recent outbound messages to avoid repeating the same alert daily. For invoice_sent and payment_received, no dedup needed — they're one-time events.
- **Notification failures don't block the primary action**: If `notifyBusinessViaWhatsApp` throws, catch and log. The invoice send / payment record must still succeed.

### Tests

6. **`api/tests/services/whatsapp/notifications.test.ts`**:
   - Business with active conversation → job enqueued
   - Business with no conversation → no job enqueued, no error
   - Business with blocked conversation → no job enqueued
   - Template interpolation produces correct Hebrew text
   - Notification failure doesn't propagate (caught and logged)

7. **`api/tests/jobs/handlers/overdue-detection.test.ts`** — Update existing test:
   - Verify notification enqueued for newly overdue invoices
   - Verify no notification when conversation doesn't exist
   - Verify daily dedup (no repeat notification same day)

## Acceptance Criteria

- [ ] Invoice sent → business owner gets WhatsApp notification
- [ ] Payment received → business owner gets WhatsApp notification
- [ ] Overdue invoices → daily notification (max 5 per business per day)
- [ ] No conversation exists → silent skip (no error)
- [ ] Blocked conversation → silent skip
- [ ] Notification failure doesn't block the primary action
- [ ] No duplicate overdue notifications same day
- [ ] All notifications in Hebrew with correct formatting
- [ ] `npm run check` passes

## Size

~200 lines production code + ~150 lines tests. Small-medium ticket.

## Dependencies

- TWA-02 (WhatsApp service for sending)
- TWA-04 (conversation table for lookup)
- Independent of TWA-05/06 (no LLM involved)
