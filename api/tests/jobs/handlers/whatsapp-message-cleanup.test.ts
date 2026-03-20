import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { createWhatsappMessageCleanupHandler } from '../../../src/jobs/handlers/whatsapp-message-cleanup.js';
import { db } from '../../../src/db/client.js';
import {
  whatsappConversations,
  whatsappMessages,
  whatsappPendingActions,
} from '../../../src/db/schema.js';
import { resetDb } from '../../utils/db.js';
import { createUser } from '../../utils/businesses.js';
import { makeLogger, makeJob } from '../../utils/jobs.js';

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function createConversation(userId: string) {
  const [row] = await db
    .insert(whatsappConversations)
    .values({
      userId,
      phone: '+972521234567',
      status: 'active',
    })
    .returning();
  return row!;
}

async function createMessage(conversationId: string, createdAt: Date, body: string) {
  const [row] = await db
    .insert(whatsappMessages)
    .values({
      id: randomUUID(),
      conversationId,
      direction: 'inbound',
      llmRole: 'user',
      body,
      createdAt,
    })
    .returning();
  return row!;
}

async function createPendingAction(conversationId: string, expiresAt: Date) {
  const [row] = await db
    .insert(whatsappPendingActions)
    .values({
      conversationId,
      actionType: 'finalize_invoice',
      payload: '{"invoiceId": "inv-1"}',
      expiresAt,
    })
    .returning();
  return row!;
}

let logger: FastifyBaseLogger;
let conversationId: string;

async function runHandler() {
  const handler = createWhatsappMessageCleanupHandler(logger);
  await handler(makeJob('whatsapp-message-cleanup'));
}

describe('whatsapp-message-cleanup handler', () => {
  beforeEach(async () => {
    await resetDb();
    logger = makeLogger();
    const user = await createUser();
    const conversation = await createConversation(user.id);
    conversationId = conversation.id;
  });

  it('deletes old messages and expired pending actions', async () => {
    const oldMsg = await createMessage(conversationId, daysAgo(100), 'old message');
    const recentMsg = await createMessage(conversationId, daysAgo(10), 'recent message');
    const expiredAction = await createPendingAction(conversationId, daysAgo(1));
    const validAction = await createPendingAction(conversationId, new Date(Date.now() + 60_000));

    await runHandler();

    const remainingMessages = await db.select().from(whatsappMessages);
    expect(remainingMessages).toHaveLength(1);
    expect(remainingMessages[0]!.id).toBe(recentMsg.id);
    expect(remainingMessages.some((m) => m.id === oldMsg.id)).toBe(false);

    const remainingActions = await db.select().from(whatsappPendingActions);
    expect(remainingActions).toHaveLength(1);
    expect(remainingActions[0]!.id).toBe(validAction.id);
    expect(remainingActions.some((a) => a.id === expiredAction.id)).toBe(false);

    expect(logger.info).toHaveBeenCalledWith(
      { deletedMessages: 1, deletedActions: 1 },
      'whatsapp-message-cleanup: completed'
    );
  });

  it('handles empty tables gracefully', async () => {
    await runHandler();

    expect(logger.info).toHaveBeenCalledWith(
      { deletedMessages: 0, deletedActions: 0 },
      'whatsapp-message-cleanup: completed'
    );
  });
});
