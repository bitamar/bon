import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createSession, deleteSession, getSession } from '../../src/auth/session.js';
import { db } from '../../src/db/client.js';
import { users, sessions } from '../../src/db/schema.js';
import { resetDb } from '../utils/db.js';
import { eq } from 'drizzle-orm';

describe('auth/session', () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function insertUser() {
    const [user] = await db
      .insert(users)
      .values({
        email: `user-${randomUUID()}@example.com`,
        name: 'Session Tester',
      })
      .returning();
    if (!user) throw new Error('Failed to insert test user');
    return user;
  }

  it('persists new sessions and returns session data', async () => {
    const user = await insertUser();
    const session = await createSession(user);

    const row = await db.query.sessions.findFirst({
      where: (table, { eq }) => eq(table.id, session.id),
    });

    expect(row).toBeTruthy();
    if (!row) throw new Error('Session row not found');
    expect(row.userId).toBe(user.id);
    expect(row.createdAt.getTime()).toBe(session.createdAt.getTime());
  });

  it('returns session from database and refreshes lastAccessedAt', async () => {
    const user = await insertUser();
    const session = await createSession(user);

    const before = await db.query.sessions.findFirst({
      where: (table, { eq }) => eq(table.id, session.id),
    });
    if (!before) throw new Error('Session row not found before read');

    const fetched = await getSession(session.id);
    expect(fetched).toBeTruthy();
    if (!fetched) throw new Error('getSession returned undefined');
    expect(fetched.id).toBe(session.id);
    expect(fetched.user.id).toBe(user.id);

    const after = await db.query.sessions.findFirst({
      where: (table, { eq }) => eq(table.id, session.id),
    });
    if (!after) throw new Error('Session row missing after read');

    expect(after.lastAccessedAt.getTime()).toBeGreaterThanOrEqual(before.lastAccessedAt.getTime());
  });

  it('deletes session when deleteSession is called', async () => {
    const user = await insertUser();
    const session = await createSession(user);

    await deleteSession(session.id);

    const row = await db.query.sessions.findFirst({
      where: (table, { eq }) => eq(table.id, session.id),
    });

    expect(row).toBeUndefined();
  });

  it('expires sessions and removes them from database', async () => {
    const user = await insertUser();
    const session = await createSession(user);

    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, session.id));

    const fetched = await getSession(session.id);
    expect(fetched).toBeUndefined();

    const row = await db.query.sessions.findFirst({
      where: (table, { eq }) => eq(table.id, session.id),
    });
    expect(row).toBeUndefined();
  });
});
