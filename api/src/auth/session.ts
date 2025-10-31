import { randomUUID } from 'node:crypto';
import type { DbUser, SessionData } from './types.js';
import { db } from '../db/client.js';
import { eq } from 'drizzle-orm';
import { sessions as sessionsTable, users as usersTable } from '../db/schema.js';
import { SESSION_TTL } from './constants.js';

export async function createSession(user: DbUser): Promise<SessionData> {
  const id = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * SESSION_TTL);
  await db
    .insert(sessionsTable)
    .values({ id, userId: user.id, createdAt: now, lastAccessedAt: now, expiresAt });

  return { id, user, createdAt: now, lastAccessedAt: now };
}

export async function getSession(sessionId: string | undefined): Promise<SessionData | undefined> {
  if (!sessionId) return undefined;

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId))
    .limit(1);
  if (!session) return undefined;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, session.userId))
    .limit(1);
  if (!user) return undefined;
  const now = new Date();
  if (session.expiresAt <= now) {
    // Expired: delete and return undefined
    await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId));
    return undefined;
  }
  const data: SessionData = {
    id: session.id,
    user,
    createdAt: session.createdAt,
    lastAccessedAt: now,
  };
  // Rolling update
  await db
    .update(sessionsTable)
    .set({ lastAccessedAt: now })
    .where(eq(sessionsTable.id, sessionId));
  return data;
}

export async function deleteSession(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId));
}
