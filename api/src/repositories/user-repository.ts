import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import type { DbOrTx } from '../db/types.js';

export type UserRecord = (typeof users)['$inferSelect'];
export type UserInsert = (typeof users)['$inferInsert'];

export async function updateUserById(userId: string, updates: Partial<UserInsert>) {
  const rows = await db.update(users).set(updates).where(eq(users.id, userId)).returning();
  return rows[0] ?? null;
}

export async function findUserById(
  userId: string,
  txOrDb: DbOrTx = db
): Promise<UserRecord | null> {
  const rows = await txOrDb.select().from(users).where(eq(users.id, userId));
  return rows[0] ?? null;
}

export async function findUserByPhone(
  e164Phone: string,
  txOrDb: DbOrTx = db
): Promise<UserRecord | null> {
  const rows = await txOrDb.select().from(users).where(eq(users.phone, e164Phone));
  return rows[0] ?? null;
}
