import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { subscriptions } from '../db/schema.js';
import type { DbOrTx } from '../db/types.js';

export type SubscriptionRecord = (typeof subscriptions)['$inferSelect'];
export type SubscriptionInsert = (typeof subscriptions)['$inferInsert'];

export async function findSubscriptionByBusinessId(
  businessId: string,
  txOrDb: DbOrTx = db
): Promise<SubscriptionRecord | null> {
  const rows = await txOrDb
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.businessId, businessId));
  return rows[0] ?? null;
}

export async function insertSubscription(
  data: SubscriptionInsert,
  txOrDb: DbOrTx = db
): Promise<SubscriptionRecord | null> {
  const rows = await txOrDb.insert(subscriptions).values(data).returning();
  return rows[0] ?? null;
}

export async function updateSubscription(
  id: string,
  updates: Partial<SubscriptionInsert>,
  txOrDb: DbOrTx = db
): Promise<SubscriptionRecord | null> {
  const rows = await txOrDb
    .update(subscriptions)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(subscriptions.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function upsertSubscription(
  data: SubscriptionInsert,
  txOrDb: DbOrTx = db
): Promise<SubscriptionRecord | null> {
  const rows = await txOrDb
    .insert(subscriptions)
    .values(data)
    .onConflictDoUpdate({
      target: subscriptions.businessId,
      set: {
        plan: data.plan,
        status: data.status,
        meshulamCustomerId: data.meshulamCustomerId,
        meshulamProcessId: data.meshulamProcessId,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        trialEndsAt: data.trialEndsAt,
        cancelledAt: data.cancelledAt,
        updatedAt: new Date(),
      },
    })
    .returning();
  return rows[0] ?? null;
}
