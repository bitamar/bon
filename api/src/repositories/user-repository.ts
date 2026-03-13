import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';

export type UserRecord = (typeof users)['$inferSelect'];
export type UserInsert = (typeof users)['$inferInsert'];

export async function findUserById(userId: string) {
  const rows = await db.select().from(users).where(eq(users.id, userId));
  return rows[0] ?? null;
}

export async function updateUserById(userId: string, updates: Partial<UserInsert>) {
  const rows = await db.update(users).set(updates).where(eq(users.id, userId)).returning();
  return rows[0] ?? null;
}
