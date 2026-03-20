import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { resetDb } from '../utils/db.js';
import { createUser, createTestBusiness, addUserToBusiness } from '../utils/businesses.js';
import {
  upsertConversation,
  findConversationByUserId,
  findConversationByPhone,
  findConversationById,
  updateConversation,
  insertMessage,
  findRecentMessages,
  countRecentInboundMessages,
  deleteOldMessages,
  upsertPendingAction,
  findPendingAction,
  deletePendingAction,
  deleteExpiredPendingActions,
} from '../../src/repositories/whatsapp-repository.js';

// ── helpers ──

async function setupUserAndConversation() {
  const user = await createUser({ phone: '+972521234567' });
  const conversation = await upsertConversation({
    userId: user.id,
    phone: '+972521234567',
  });
  return { user, conversation };
}

describe('whatsapp-repository', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  // ── Conversations ──

  describe('conversations', () => {
    it('creates a conversation via upsert', async () => {
      const user = await createUser({ phone: '+972521234567' });

      const conv = await upsertConversation({
        userId: user.id,
        phone: '+972521234567',
      });

      expect(conv.id).toBeDefined();
      expect(conv.userId).toBe(user.id);
      expect(conv.phone).toBe('+972521234567');
      expect(conv.status).toBe('active');
      expect(conv.activeBusinessId).toBeNull();
    });

    it('upserts on same user — updates phone and lastActivityAt', async () => {
      const user = await createUser({ phone: '+972521234567' });

      const first = await upsertConversation({ userId: user.id, phone: '+972521234567' });
      const second = await upsertConversation({ userId: user.id, phone: '+972529999999' });

      expect(second.id).toBe(first.id);
      expect(second.phone).toBe('+972529999999');
    });

    it('finds conversation by userId', async () => {
      const { user, conversation } = await setupUserAndConversation();

      const found = await findConversationByUserId(user.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(conversation.id);
    });

    it('finds conversation by phone', async () => {
      const { conversation } = await setupUserAndConversation();

      const found = await findConversationByPhone('+972521234567');

      expect(found).not.toBeNull();
      expect(found!.id).toBe(conversation.id);
    });

    it('finds conversation by id', async () => {
      const { conversation } = await setupUserAndConversation();

      const found = await findConversationById(conversation.id);

      expect(found).not.toBeNull();
      expect(found!.userId).toBe(conversation.userId);
    });

    it('returns null for non-existent userId', async () => {
      const found = await findConversationByUserId('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });

    it('updates activeBusinessId', async () => {
      const { user, conversation } = await setupUserAndConversation();
      const business = await createTestBusiness(user.id);
      await addUserToBusiness(user.id, business.id, 'owner');

      const updated = await updateConversation(conversation.id, {
        activeBusinessId: business.id,
      });

      expect(updated).not.toBeNull();
      expect(updated!.activeBusinessId).toBe(business.id);
    });

    it('updates status to blocked', async () => {
      const { conversation } = await setupUserAndConversation();

      const updated = await updateConversation(conversation.id, { status: 'blocked' });

      expect(updated!.status).toBe('blocked');
    });
  });

  // ── Messages ──

  describe('messages', () => {
    it('inserts an inbound message', async () => {
      const { conversation } = await setupUserAndConversation();

      const msg = await insertMessage({
        conversationId: conversation.id,
        twilioSid: 'SM123abc',
        direction: 'inbound',
        llmRole: 'user',
        body: 'שלום',
      });

      expect(msg).not.toBeNull();
      expect(msg!.direction).toBe('inbound');
      expect(msg!.body).toBe('שלום');
      expect(msg!.twilioSid).toBe('SM123abc');
    });

    it('is idempotent on duplicate twilioSid', async () => {
      const { conversation } = await setupUserAndConversation();

      const first = await insertMessage({
        conversationId: conversation.id,
        twilioSid: 'SM_DUP',
        direction: 'inbound',
        llmRole: 'user',
        body: 'first',
      });

      const second = await insertMessage({
        conversationId: conversation.id,
        twilioSid: 'SM_DUP',
        direction: 'inbound',
        llmRole: 'user',
        body: 'duplicate',
      });

      expect(first).not.toBeNull();
      expect(second).toBeNull();
    });

    it('allows multiple messages without twilioSid', async () => {
      const { conversation } = await setupUserAndConversation();

      const m1 = await insertMessage({
        conversationId: conversation.id,
        direction: 'outbound',
        llmRole: 'assistant',
        body: 'response 1',
      });

      const m2 = await insertMessage({
        conversationId: conversation.id,
        direction: 'outbound',
        llmRole: 'assistant',
        body: 'response 2',
      });

      expect(m1).not.toBeNull();
      expect(m2).not.toBeNull();
      expect(m1!.id).not.toBe(m2!.id);
    });

    it('stores tool_call messages', async () => {
      const { conversation } = await setupUserAndConversation();

      const msg = await insertMessage({
        conversationId: conversation.id,
        direction: 'outbound',
        llmRole: 'tool_call',
        toolName: 'find_customer',
        toolCallId: 'toolu_123',
        body: JSON.stringify({ query: 'test' }),
      });

      expect(msg).not.toBeNull();
      expect(msg!.toolName).toBe('find_customer');
      expect(msg!.toolCallId).toBe('toolu_123');
    });

    it('returns recent messages in descending order', async () => {
      const { conversation } = await setupUserAndConversation();

      for (let i = 0; i < 5; i++) {
        await insertMessage({
          conversationId: conversation.id,
          direction: 'inbound',
          llmRole: 'user',
          body: `msg ${i}`,
        });
      }

      const recent = await findRecentMessages(conversation.id, 3);

      expect(recent).toHaveLength(3);
      expect(recent[0]!.body).toBe('msg 4');
      expect(recent[2]!.body).toBe('msg 2');
    });

    it('counts recent inbound messages', async () => {
      const { conversation } = await setupUserAndConversation();

      await insertMessage({
        conversationId: conversation.id,
        direction: 'inbound',
        llmRole: 'user',
        body: 'a',
      });
      await insertMessage({
        conversationId: conversation.id,
        direction: 'outbound',
        llmRole: 'assistant',
        body: 'b',
      });
      await insertMessage({
        conversationId: conversation.id,
        direction: 'inbound',
        llmRole: 'user',
        body: 'c',
      });

      const count = await countRecentInboundMessages(conversation.id, 60);
      expect(count).toBe(2);
    });

    it('does not delete recent messages', async () => {
      const { conversation } = await setupUserAndConversation();

      await insertMessage({
        conversationId: conversation.id,
        direction: 'inbound',
        llmRole: 'user',
        body: 'recent message',
      });

      const deleted = await deleteOldMessages(90);
      expect(deleted).toBe(0);

      const recent = await findRecentMessages(conversation.id);
      expect(recent).toHaveLength(1);
    });

    it('deletes messages older than the cutoff', async () => {
      const { conversation } = await setupUserAndConversation();

      await insertMessage({
        conversationId: conversation.id,
        direction: 'inbound',
        llmRole: 'user',
        body: 'will be deleted',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      });

      // olderThanDays=1 means cutoff is 1 day ago — the 2-day-old message qualifies
      const deleted = await deleteOldMessages(1);
      expect(deleted).toBe(1);

      const remaining = await findRecentMessages(conversation.id);
      expect(remaining).toHaveLength(0);
    });
  });

  // ── Pending Actions ──

  describe('pending actions', () => {
    it('creates a pending action', async () => {
      const { conversation } = await setupUserAndConversation();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      const action = await upsertPendingAction({
        conversationId: conversation.id,
        actionType: 'finalize_invoice',
        payload: JSON.stringify({ invoiceId: '123' }),
        expiresAt,
      });

      expect(action.actionType).toBe('finalize_invoice');
      expect(action.conversationId).toBe(conversation.id);
    });

    it('upserts on same conversation + actionType', async () => {
      const { conversation } = await setupUserAndConversation();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      const first = await upsertPendingAction({
        conversationId: conversation.id,
        actionType: 'finalize_invoice',
        payload: JSON.stringify({ invoiceId: 'old' }),
        expiresAt,
      });

      const second = await upsertPendingAction({
        conversationId: conversation.id,
        actionType: 'finalize_invoice',
        payload: JSON.stringify({ invoiceId: 'new' }),
        expiresAt,
      });

      expect(second.id).toBe(first.id);
      expect(second.payload).toBe(JSON.stringify({ invoiceId: 'new' }));
    });

    it('finds a non-expired pending action', async () => {
      const { conversation } = await setupUserAndConversation();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await upsertPendingAction({
        conversationId: conversation.id,
        actionType: 'delete_customer',
        payload: JSON.stringify({ customerId: 'abc' }),
        expiresAt,
      });

      const found = await findPendingAction(conversation.id, 'delete_customer');
      expect(found).not.toBeNull();
      expect(found!.actionType).toBe('delete_customer');
    });

    it('does not find an expired pending action', async () => {
      const { conversation } = await setupUserAndConversation();
      const expired = new Date(Date.now() - 1000);

      await upsertPendingAction({
        conversationId: conversation.id,
        actionType: 'finalize_invoice',
        payload: JSON.stringify({ invoiceId: '123' }),
        expiresAt: expired,
      });

      const found = await findPendingAction(conversation.id, 'finalize_invoice');
      expect(found).toBeNull();
    });

    it('deletes a pending action by id', async () => {
      const { conversation } = await setupUserAndConversation();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      const action = await upsertPendingAction({
        conversationId: conversation.id,
        actionType: 'finalize_invoice',
        payload: JSON.stringify({}),
        expiresAt,
      });

      await deletePendingAction(action.id);

      const found = await findPendingAction(conversation.id, 'finalize_invoice');
      expect(found).toBeNull();
    });

    it('deletes expired pending actions', async () => {
      const { conversation } = await setupUserAndConversation();
      const expired = new Date(Date.now() - 1000);
      const future = new Date(Date.now() + 10 * 60 * 1000);

      await upsertPendingAction({
        conversationId: conversation.id,
        actionType: 'finalize_invoice',
        payload: JSON.stringify({}),
        expiresAt: expired,
      });
      await upsertPendingAction({
        conversationId: conversation.id,
        actionType: 'delete_customer',
        payload: JSON.stringify({}),
        expiresAt: future,
      });

      const deleted = await deleteExpiredPendingActions();
      expect(deleted).toBe(1);

      const remaining = await findPendingAction(conversation.id, 'delete_customer');
      expect(remaining).not.toBeNull();
    });
  });
});
