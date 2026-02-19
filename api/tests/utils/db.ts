import { randomUUID } from 'node:crypto';
import { db } from '../../src/db/client.js';
import {
  businessInvitations,
  businesses,
  sessions,
  userBusinesses,
  users,
} from '../../src/db/schema.js';

export async function resetDb() {
  await db.delete(businessInvitations);
  await db.delete(userBusinesses);
  await db.delete(businesses);
  await db.delete(sessions);
  await db.delete(users);
}

export async function createTestUserWithSession() {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email: `tester-${randomUUID()}@example.com`,
        name: 'Test User',
      })
      .returning();

    const now = new Date();
    const [session] = await tx
      .insert(sessions)
      .values({
        id: randomUUID(),
        userId: user.id,
        createdAt: now,
        lastAccessedAt: now,
        expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24),
      })
      .returning();

    return { user, session };
  });
}
