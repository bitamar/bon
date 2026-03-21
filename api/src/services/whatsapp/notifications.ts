import type { PgBoss } from 'pg-boss';
import type { FastifyBaseLogger } from 'fastify';
import {
  findConversationByUserId,
  findEligibleNotificationUsers,
  findOutboundMessagesSince,
  insertMessage,
} from '../../repositories/whatsapp-repository.js';
import { sendJob } from '../../jobs/boss.js';

// ── Templates ──

const TEMPLATES = {
  invoice_sent: 'החשבונית {documentNumber} ל{customerName} נשלחה בהצלחה ✓',
  payment_received: 'תשלום {amount} התקבל עבור {documentNumber} ✓',
  invoice_overdue: '⚠️ חשבונית {documentNumber} ל{customerName} — {days} ימים ללא תשלום',
  shaam_failed: '⚠️ בעיה עם הקצאת SHAAM לחשבונית {documentNumber} — {reason}',
} as const;

export type NotificationTemplate = keyof typeof TEMPLATES;

export function formatTemplate(
  template: NotificationTemplate,
  data: Record<string, string>
): string {
  let result: string = TEMPLATES[template];
  for (const [key, value] of Object.entries(data)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}

// ── 24-hour window constant ──

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// ── Shared dispatch logic ──

interface DispatchCallback {
  (conversationId: string, phone: string): Promise<void>;
}

/**
 * Finds eligible users for a business and dispatches to each one with
 * an active, non-blocked, within-24h conversation. Errors are caught internally.
 */
async function dispatchToEligibleUsers(
  businessId: string,
  callback: DispatchCallback,
  logger: FastifyBaseLogger,
  context: Record<string, unknown>
): Promise<void> {
  try {
    const eligibleUsers = await findEligibleNotificationUsers(businessId);
    const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);

    for (const user of eligibleUsers) {
      if (!user.phone || !user.whatsappEnabled) continue;

      const conversation = await findConversationByUserId(user.userId);
      if (!conversation) continue;
      if (conversation.status === 'blocked') continue;
      if (conversation.lastActivityAt.getTime() < cutoff.getTime()) continue;

      await callback(conversation.id, user.phone);
    }
  } catch (err: unknown) {
    logger.error({ err, businessId, ...context }, 'whatsapp notification failed — swallowed');
  }
}

// ── Main notification function ──

/**
 * Sends a WhatsApp notification to all owners/admins of a business who:
 * - Have a phone number set
 * - Have whatsappEnabled = true
 * - Have an active (non-blocked) conversation
 * - Have been active on WhatsApp within the last 24 hours
 *
 * All errors are caught internally — notifications never block the primary action.
 */
export async function notifyBusinessUsersViaWhatsApp(
  businessId: string,
  template: NotificationTemplate,
  data: Record<string, string>,
  boss: PgBoss,
  logger: FastifyBaseLogger
): Promise<void> {
  const message = formatTemplate(template, data);

  await dispatchToEligibleUsers(
    businessId,
    async (conversationId, phone) => {
      await sendJob(boss, 'send-whatsapp-reply', {
        conversationId,
        body: message,
        to: phone,
      });
    },
    logger,
    { template }
  );
}

// ── Overdue notification helpers ──

/**
 * Checks if an overdue notification was already sent today for a specific invoice.
 * Uses the metadata JSON field (stored as text) for dedup.
 */
export async function wasOverdueNotificationSentToday(
  conversationId: string,
  invoiceId: string
): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const messages = await findOutboundMessagesSince(conversationId, todayStart);

  return messages.some((msg) => {
    if (!msg.metadata) return false;
    try {
      const parsed = JSON.parse(msg.metadata) as Record<string, unknown>;
      return parsed['notificationType'] === 'invoice_overdue' && parsed['invoiceId'] === invoiceId;
    } catch {
      return false;
    }
  });
}

/**
 * Sends overdue notifications for newly overdue invoices.
 * - Max 5 per business per day, prioritized by most overdue first
 * - Deduplicates using metadata on outbound messages
 */
export async function sendOverdueNotifications(
  businessId: string,
  newlyOverdueInvoices: Array<{
    id: string;
    documentNumber: string | null;
    customerName: string | null;
    daysOverdue: number;
  }>,
  boss: PgBoss,
  logger: FastifyBaseLogger
): Promise<void> {
  // Sort by days overdue descending, take first 5
  const sorted = [...newlyOverdueInvoices]
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, 5);

  await dispatchToEligibleUsers(
    businessId,
    async (conversationId, phone) => {
      for (const invoice of sorted) {
        const alreadySent = await wasOverdueNotificationSentToday(conversationId, invoice.id);
        if (alreadySent) continue;

        const message = formatTemplate('invoice_overdue', {
          documentNumber: invoice.documentNumber ?? '—',
          customerName: invoice.customerName ?? '—',
          days: String(invoice.daysOverdue),
        });

        const metadata = JSON.stringify({
          notificationType: 'invoice_overdue',
          invoiceId: invoice.id,
        });

        await sendJob(boss, 'send-whatsapp-reply', {
          conversationId,
          body: message,
          to: phone,
        });

        // Insert message record for dedup tracking
        await insertMessage({
          conversationId,
          direction: 'outbound',
          llmRole: 'assistant',
          body: message,
          metadata,
        });
      }
    },
    logger,
    {}
  );
}
