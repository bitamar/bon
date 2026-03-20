import type { PgBoss } from 'pg-boss';
import type { FastifyBaseLogger } from 'fastify';
import { and, eq, gt, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users, userBusinesses, whatsappConversations, whatsappMessages } from '../../db/schema.js';
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
  logger: FastifyBaseLogger,
  metadata?: Record<string, string>
): Promise<void> {
  try {
    // Find all owners/admins of this business
    const eligibleUsers = await db
      .select({
        userId: users.id,
        phone: users.phone,
        whatsappEnabled: users.whatsappEnabled,
      })
      .from(userBusinesses)
      .innerJoin(users, eq(userBusinesses.userId, users.id))
      .where(
        and(
          eq(userBusinesses.businessId, businessId),
          inArray(userBusinesses.role, ['owner', 'admin'])
        )
      );

    const message = formatTemplate(template, data);
    const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);

    for (const user of eligibleUsers) {
      // Guard: no phone or whatsapp disabled
      if (!user.phone || !user.whatsappEnabled) continue;

      // Guard: find conversation
      const [conversation] = await db
        .select({
          id: whatsappConversations.id,
          status: whatsappConversations.status,
          lastActivityAt: whatsappConversations.lastActivityAt,
        })
        .from(whatsappConversations)
        .where(eq(whatsappConversations.userId, user.userId));

      if (!conversation) continue;

      // Guard: blocked conversation
      if (conversation.status === 'blocked') continue;

      // Guard: 24-hour window
      if (conversation.lastActivityAt < cutoff) continue;

      // Enqueue the message
      const metadataStr = metadata ? JSON.stringify(metadata) : undefined;
      await sendJob(boss, 'send-whatsapp-reply', {
        conversationId: conversation.id,
        body: message,
        to: user.phone,
      });

      // If metadata provided, insert an outbound message record for dedup tracking
      if (metadataStr) {
        await db.insert(whatsappMessages).values({
          conversationId: conversation.id,
          direction: 'outbound',
          llmRole: 'assistant',
          body: message,
          metadata: metadataStr,
        });
      }
    }
  } catch (err: unknown) {
    logger.error({ err, businessId, template }, 'whatsapp notification failed — swallowed');
  }
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

  const messages = await db
    .select({ metadata: whatsappMessages.metadata })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.conversationId, conversationId),
        eq(whatsappMessages.direction, 'outbound'),
        gt(whatsappMessages.createdAt, todayStart)
      )
    );

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
  try {
    // Sort by days overdue descending, take first 5
    const sorted = [...newlyOverdueInvoices]
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 5);

    // Find all eligible users (owners/admins with phone + whatsapp + active conversation in window)
    const eligibleUsers = await db
      .select({
        userId: users.id,
        phone: users.phone,
        whatsappEnabled: users.whatsappEnabled,
      })
      .from(userBusinesses)
      .innerJoin(users, eq(userBusinesses.userId, users.id))
      .where(
        and(
          eq(userBusinesses.businessId, businessId),
          inArray(userBusinesses.role, ['owner', 'admin'])
        )
      );

    const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);

    for (const user of eligibleUsers) {
      if (!user.phone || !user.whatsappEnabled) continue;

      const [conversation] = await db
        .select({
          id: whatsappConversations.id,
          status: whatsappConversations.status,
          lastActivityAt: whatsappConversations.lastActivityAt,
        })
        .from(whatsappConversations)
        .where(eq(whatsappConversations.userId, user.userId));

      if (!conversation) continue;
      if (conversation.status === 'blocked') continue;
      if (conversation.lastActivityAt < cutoff) continue;

      for (const invoice of sorted) {
        // Dedup: check if this invoice's overdue notification was already sent today
        const alreadySent = await wasOverdueNotificationSentToday(conversation.id, invoice.id);
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
          conversationId: conversation.id,
          body: message,
          to: user.phone,
        });

        // Insert message record for dedup tracking
        await db.insert(whatsappMessages).values({
          conversationId: conversation.id,
          direction: 'outbound',
          llmRole: 'assistant',
          body: message,
          metadata,
        });
      }
    }
  } catch (err: unknown) {
    logger.error({ err, businessId }, 'overdue whatsapp notifications failed — swallowed');
  }
}
