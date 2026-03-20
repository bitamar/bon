import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { whatsappConversations, whatsappMessages, whatsappPendingActions } from '../db/schema.js';
import type { DbOrTx } from '../db/types.js';

export type ConversationRecord = (typeof whatsappConversations)['$inferSelect'];
export type ConversationInsert = (typeof whatsappConversations)['$inferInsert'];
export type MessageRecord = (typeof whatsappMessages)['$inferSelect'];
export type MessageInsert = (typeof whatsappMessages)['$inferInsert'];
export type PendingActionRecord = (typeof whatsappPendingActions)['$inferSelect'];
export type PendingActionInsert = (typeof whatsappPendingActions)['$inferInsert'];

// ── Conversations ──

export async function findConversationByUserId(
  userId: string,
  txOrDb: DbOrTx = db
): Promise<ConversationRecord | null> {
  const rows = await txOrDb
    .select()
    .from(whatsappConversations)
    .where(eq(whatsappConversations.userId, userId));
  return rows[0] ?? null;
}

export async function findConversationByPhone(
  phone: string,
  txOrDb: DbOrTx = db
): Promise<ConversationRecord | null> {
  const rows = await txOrDb
    .select()
    .from(whatsappConversations)
    .where(eq(whatsappConversations.phone, phone));
  return rows[0] ?? null;
}

export async function findConversationById(
  id: string,
  txOrDb: DbOrTx = db
): Promise<ConversationRecord | null> {
  const rows = await txOrDb
    .select()
    .from(whatsappConversations)
    .where(eq(whatsappConversations.id, id));
  return rows[0] ?? null;
}

export async function upsertConversation(
  data: ConversationInsert,
  txOrDb: DbOrTx = db
): Promise<ConversationRecord> {
  const rows = await txOrDb
    .insert(whatsappConversations)
    .values(data)
    .onConflictDoUpdate({
      target: whatsappConversations.userId,
      set: {
        phone: data.phone,
        lastActivityAt: new Date(),
        status: 'active',
      },
    })
    .returning();
  return rows[0]!;
}

export async function updateConversation(
  id: string,
  data: Partial<Pick<ConversationRecord, 'activeBusinessId' | 'status' | 'lastActivityAt'>>,
  txOrDb: DbOrTx = db
): Promise<ConversationRecord | null> {
  const rows = await txOrDb
    .update(whatsappConversations)
    .set(data)
    .where(eq(whatsappConversations.id, id))
    .returning();
  return rows[0] ?? null;
}

// ── Messages ──

export async function insertMessage(
  data: MessageInsert,
  txOrDb: DbOrTx = db
): Promise<MessageRecord | null> {
  // ON CONFLICT (twilioSid) DO NOTHING for idempotency
  const rows = await txOrDb.insert(whatsappMessages).values(data).onConflictDoNothing().returning();
  return rows[0] ?? null;
}

/** Returns messages in reverse-chronological order (newest first). Caller must reverse for LLM context. */
export async function findRecentMessages(
  conversationId: string,
  limit: number = 40,
  txOrDb: DbOrTx = db
): Promise<MessageRecord[]> {
  return txOrDb
    .select()
    .from(whatsappMessages)
    .where(eq(whatsappMessages.conversationId, conversationId))
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(limit);
}

export async function countRecentInboundMessages(
  conversationId: string,
  sinceSeconds: number = 60,
  txOrDb: DbOrTx = db
): Promise<number> {
  const since = new Date(Date.now() - sinceSeconds * 1000);
  const rows = await txOrDb
    .select({ count: sql<number>`count(*)::int` })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.conversationId, conversationId),
        eq(whatsappMessages.direction, 'inbound'),
        gt(whatsappMessages.createdAt, since)
      )
    );
  return rows[0]?.count ?? 0;
}

export async function deleteOldMessages(
  olderThanDays: number = 90,
  txOrDb: DbOrTx = db
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const result = await txOrDb
    .delete(whatsappMessages)
    .where(sql`${whatsappMessages.createdAt} <= ${cutoff}`)
    .returning({ id: whatsappMessages.id });
  return result.length;
}

// ── Pending Actions ──

export async function upsertPendingAction(
  data: PendingActionInsert,
  txOrDb: DbOrTx = db
): Promise<PendingActionRecord> {
  const rows = await txOrDb
    .insert(whatsappPendingActions)
    .values(data)
    .onConflictDoUpdate({
      target: [whatsappPendingActions.conversationId, whatsappPendingActions.actionType],
      set: {
        payload: data.payload,
        expiresAt: data.expiresAt,
      },
    })
    .returning();
  return rows[0]!;
}

export async function findPendingAction(
  conversationId: string,
  actionType: string,
  txOrDb: DbOrTx = db
): Promise<PendingActionRecord | null> {
  const now = new Date();
  const rows = await txOrDb
    .select()
    .from(whatsappPendingActions)
    .where(
      and(
        eq(whatsappPendingActions.conversationId, conversationId),
        eq(whatsappPendingActions.actionType, actionType),
        gt(whatsappPendingActions.expiresAt, now)
      )
    );
  return rows[0] ?? null;
}

export async function deletePendingAction(id: string, txOrDb: DbOrTx = db): Promise<void> {
  await txOrDb.delete(whatsappPendingActions).where(eq(whatsappPendingActions.id, id));
}

export async function deleteExpiredPendingActions(txOrDb: DbOrTx = db): Promise<number> {
  const now = new Date();
  const result = await txOrDb
    .delete(whatsappPendingActions)
    .where(sql`${whatsappPendingActions.expiresAt} <= ${now}`)
    .returning({ id: whatsappPendingActions.id });
  return result.length;
}
