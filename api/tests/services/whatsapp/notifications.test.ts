import { describe, expect, it, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../../../src/db/client.js';
import { users, whatsappConversations, whatsappMessages } from '../../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { resetDb } from '../../utils/db.js';
import { createUser, createTestBusiness, addUserToBusiness } from '../../utils/businesses.js';
import {
  notifyBusinessUsersViaWhatsApp,
  sendOverdueNotifications,
  wasOverdueNotificationSentToday,
  formatTemplate,
} from '../../../src/services/whatsapp/notifications.js';
import { makeLogger } from '../../utils/jobs.js';
import type { FastifyBaseLogger } from 'fastify';
import type { PgBoss } from 'pg-boss';

vi.mock('../../../src/jobs/boss.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/jobs/boss.js')>();
  return { ...actual, sendJob: vi.fn() };
});

import { sendJob } from '../../../src/jobs/boss.js';

const mockBoss = {} as PgBoss;
let logger: FastifyBaseLogger;

function recentActivity(): Date {
  return new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
}

function staleActivity(): Date {
  return new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
}

async function createUserWithPhone(phone: string | null, whatsappEnabled = true) {
  const user = await createUser();
  await db.update(users).set({ phone, whatsappEnabled }).where(eq(users.id, user.id));
  return user;
}

async function createConversation(
  userId: string,
  phone: string,
  opts: { status?: 'active' | 'idle' | 'blocked'; lastActivityAt?: Date } = {}
) {
  const [conv] = await db
    .insert(whatsappConversations)
    .values({
      userId,
      phone,
      status: opts.status ?? 'active',
      lastActivityAt: opts.lastActivityAt ?? recentActivity(),
    })
    .returning();
  return conv!;
}

describe('formatTemplate', () => {
  it('interpolates template variables', () => {
    const result = formatTemplate('invoice_sent', {
      documentNumber: 'INV-0042',
      customerName: 'דוד לוי',
    });
    expect(result).toBe('החשבונית INV-0042 לדוד לוי נשלחה בהצלחה ✓');
  });

  it('interpolates payment_received template', () => {
    const result = formatTemplate('payment_received', {
      amount: '₪1,234.00',
      documentNumber: 'INV-0042',
    });
    expect(result).toBe('תשלום ₪1,234.00 התקבל עבור INV-0042 ✓');
  });

  it('interpolates invoice_overdue template', () => {
    const result = formatTemplate('invoice_overdue', {
      documentNumber: 'INV-0010',
      customerName: 'כרמל בניה',
      days: '15',
    });
    expect(result).toBe('⚠️ חשבונית INV-0010 לכרמל בניה — 15 ימים ללא תשלום');
  });
});

describe('notifyBusinessUsersViaWhatsApp', () => {
  beforeEach(async () => {
    await resetDb();
    logger = makeLogger();
    vi.mocked(sendJob).mockReset();
  });

  it('sends notification to owner with active conversation within 24h', async () => {
    const user = await createUserWithPhone('+972521234567');
    const biz = await createTestBusiness(user.id);
    await addUserToBusiness(user.id, biz.id, 'owner');
    await createConversation(user.id, '+972521234567');

    await notifyBusinessUsersViaWhatsApp(
      biz.id,
      'invoice_sent',
      { documentNumber: 'INV-001', customerName: 'Test' },
      mockBoss,
      logger
    );

    expect(sendJob).toHaveBeenCalledWith(
      mockBoss,
      'send-whatsapp-reply',
      expect.objectContaining({ to: '+972521234567' })
    );
  });

  it('notifies both admins when business has 2 admins', async () => {
    const owner = await createUserWithPhone('+972521111111');
    const admin = await createUserWithPhone('+972522222222');
    const biz = await createTestBusiness(owner.id);
    await addUserToBusiness(owner.id, biz.id, 'owner');
    await addUserToBusiness(admin.id, biz.id, 'admin');
    await createConversation(owner.id, '+972521111111');
    await createConversation(admin.id, '+972522222222');

    await notifyBusinessUsersViaWhatsApp(
      biz.id,
      'invoice_sent',
      { documentNumber: 'INV-001', customerName: 'Test' },
      mockBoss,
      logger
    );

    expect(sendJob).toHaveBeenCalledTimes(2);
  });

  it('does not notify users with role "user"', async () => {
    const owner = await createUserWithPhone('+972521111111');
    const regularUser = await createUserWithPhone('+972523333333');
    const biz = await createTestBusiness(owner.id);
    await addUserToBusiness(owner.id, biz.id, 'owner');
    await addUserToBusiness(regularUser.id, biz.id, 'user');
    await createConversation(owner.id, '+972521111111');
    await createConversation(regularUser.id, '+972523333333');

    await notifyBusinessUsersViaWhatsApp(
      biz.id,
      'invoice_sent',
      { documentNumber: 'INV-001', customerName: 'Test' },
      mockBoss,
      logger
    );

    expect(sendJob).toHaveBeenCalledTimes(1);
    expect(sendJob).toHaveBeenCalledWith(
      mockBoss,
      'send-whatsapp-reply',
      expect.objectContaining({ to: '+972521111111' })
    );
  });

  it('skips user with no phone set', async () => {
    const user = await createUserWithPhone(null);
    const biz = await createTestBusiness(user.id);
    await addUserToBusiness(user.id, biz.id, 'owner');

    await notifyBusinessUsersViaWhatsApp(
      biz.id,
      'invoice_sent',
      { documentNumber: 'INV-001', customerName: 'Test' },
      mockBoss,
      logger
    );

    expect(sendJob).not.toHaveBeenCalled();
  });

  it('skips user with whatsappEnabled = false', async () => {
    const user = await createUserWithPhone('+972521234567', false);
    const biz = await createTestBusiness(user.id);
    await addUserToBusiness(user.id, biz.id, 'owner');
    await createConversation(user.id, '+972521234567');

    await notifyBusinessUsersViaWhatsApp(
      biz.id,
      'invoice_sent',
      { documentNumber: 'INV-001', customerName: 'Test' },
      mockBoss,
      logger
    );

    expect(sendJob).not.toHaveBeenCalled();
  });

  it('skips user with no conversation', async () => {
    const user = await createUserWithPhone('+972521234567');
    const biz = await createTestBusiness(user.id);
    await addUserToBusiness(user.id, biz.id, 'owner');
    // No conversation created

    await notifyBusinessUsersViaWhatsApp(
      biz.id,
      'invoice_sent',
      { documentNumber: 'INV-001', customerName: 'Test' },
      mockBoss,
      logger
    );

    expect(sendJob).not.toHaveBeenCalled();
  });

  it('skips user with blocked conversation', async () => {
    const user = await createUserWithPhone('+972521234567');
    const biz = await createTestBusiness(user.id);
    await addUserToBusiness(user.id, biz.id, 'owner');
    await createConversation(user.id, '+972521234567', { status: 'blocked' });

    await notifyBusinessUsersViaWhatsApp(
      biz.id,
      'invoice_sent',
      { documentNumber: 'INV-001', customerName: 'Test' },
      mockBoss,
      logger
    );

    expect(sendJob).not.toHaveBeenCalled();
  });

  it('skips user with conversation lastActivityAt older than 24h', async () => {
    const user = await createUserWithPhone('+972521234567');
    const biz = await createTestBusiness(user.id);
    await addUserToBusiness(user.id, biz.id, 'owner');
    await createConversation(user.id, '+972521234567', { lastActivityAt: staleActivity() });

    await notifyBusinessUsersViaWhatsApp(
      biz.id,
      'invoice_sent',
      { documentNumber: 'INV-001', customerName: 'Test' },
      mockBoss,
      logger
    );

    expect(sendJob).not.toHaveBeenCalled();
  });

  it('catches and logs errors without propagating', async () => {
    vi.mocked(sendJob).mockRejectedValueOnce(new Error('pg-boss down'));
    const user = await createUserWithPhone('+972521234567');
    const biz = await createTestBusiness(user.id);
    await addUserToBusiness(user.id, biz.id, 'owner');
    await createConversation(user.id, '+972521234567');

    // Should not throw
    await notifyBusinessUsersViaWhatsApp(
      biz.id,
      'invoice_sent',
      { documentNumber: 'INV-001', customerName: 'Test' },
      mockBoss,
      logger
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'invoice_sent' }),
      expect.stringContaining('swallowed')
    );
  });
});

describe('wasOverdueNotificationSentToday', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('returns false when no messages exist', async () => {
    const user = await createUser();
    const conv = await createConversation(user.id, '+972521234567');
    const result = await wasOverdueNotificationSentToday(conv.id, randomUUID());
    expect(result).toBe(false);
  });

  it('returns true when matching notification was sent today', async () => {
    const user = await createUser();
    const conv = await createConversation(user.id, '+972521234567');
    const invoiceId = randomUUID();

    await db.insert(whatsappMessages).values({
      conversationId: conv.id,
      direction: 'outbound',
      llmRole: 'assistant',
      body: 'test overdue msg',
      metadata: JSON.stringify({ notificationType: 'invoice_overdue', invoiceId }),
    });

    const result = await wasOverdueNotificationSentToday(conv.id, invoiceId);
    expect(result).toBe(true);
  });

  it('returns false when notification is for a different invoice', async () => {
    const user = await createUser();
    const conv = await createConversation(user.id, '+972521234567');

    await db.insert(whatsappMessages).values({
      conversationId: conv.id,
      direction: 'outbound',
      llmRole: 'assistant',
      body: 'test overdue msg',
      metadata: JSON.stringify({ notificationType: 'invoice_overdue', invoiceId: randomUUID() }),
    });

    const result = await wasOverdueNotificationSentToday(conv.id, randomUUID());
    expect(result).toBe(false);
  });
});

describe('sendOverdueNotifications', () => {
  beforeEach(async () => {
    await resetDb();
    logger = makeLogger();
    vi.mocked(sendJob).mockReset();
  });

  it('sends notifications for overdue invoices sorted by days overdue', async () => {
    const user = await createUserWithPhone('+972521234567');
    const biz = await createTestBusiness(user.id);
    await addUserToBusiness(user.id, biz.id, 'owner');
    await createConversation(user.id, '+972521234567');

    await sendOverdueNotifications(
      biz.id,
      [
        { id: randomUUID(), documentNumber: 'INV-001', customerName: 'A', daysOverdue: 5 },
        { id: randomUUID(), documentNumber: 'INV-002', customerName: 'B', daysOverdue: 30 },
      ],
      mockBoss,
      logger
    );

    expect(sendJob).toHaveBeenCalledTimes(2);
    // First call should be for the most overdue (30 days)
    expect(sendJob).toHaveBeenNthCalledWith(
      1,
      mockBoss,
      'send-whatsapp-reply',
      expect.objectContaining({
        body: expect.stringContaining('INV-002'),
      })
    );
  });

  it('limits to max 5 notifications per business', async () => {
    const user = await createUserWithPhone('+972521234567');
    const biz = await createTestBusiness(user.id);
    await addUserToBusiness(user.id, biz.id, 'owner');
    await createConversation(user.id, '+972521234567');

    const invoices = Array.from({ length: 8 }, (_, i) => ({
      id: randomUUID(),
      documentNumber: `INV-${String(i + 1).padStart(3, '0')}`,
      customerName: `Customer ${i}`,
      daysOverdue: i + 1,
    }));

    await sendOverdueNotifications(biz.id, invoices, mockBoss, logger);

    // 5 invoices × 1 user = 5 job calls
    expect(sendJob).toHaveBeenCalledTimes(5);
  });

  it('skips invoices that already had notifications today', async () => {
    const user = await createUserWithPhone('+972521234567');
    const biz = await createTestBusiness(user.id);
    await addUserToBusiness(user.id, biz.id, 'owner');
    const conv = await createConversation(user.id, '+972521234567');

    const invoiceId = randomUUID();

    // Simulate already-sent notification
    await db.insert(whatsappMessages).values({
      conversationId: conv.id,
      direction: 'outbound',
      llmRole: 'assistant',
      body: 'previous overdue msg',
      metadata: JSON.stringify({ notificationType: 'invoice_overdue', invoiceId }),
    });

    await sendOverdueNotifications(
      biz.id,
      [{ id: invoiceId, documentNumber: 'INV-001', customerName: 'A', daysOverdue: 5 }],
      mockBoss,
      logger
    );

    expect(sendJob).not.toHaveBeenCalled();
  });

  it('catches errors without propagating', async () => {
    vi.mocked(sendJob).mockRejectedValueOnce(new Error('boom'));
    const user = await createUserWithPhone('+972521234567');
    const biz = await createTestBusiness(user.id);
    await addUserToBusiness(user.id, biz.id, 'owner');
    await createConversation(user.id, '+972521234567');

    await sendOverdueNotifications(
      biz.id,
      [{ id: randomUUID(), documentNumber: 'INV-001', customerName: 'A', daysOverdue: 5 }],
      mockBoss,
      logger
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: biz.id }),
      expect.stringContaining('swallowed')
    );
  });
});
