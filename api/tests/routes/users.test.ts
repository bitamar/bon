import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/app.js';
import { resetDb } from '../utils/db.js';
import { injectAuthed } from '../utils/inject.js';
import { db } from '../../src/db/client.js';
import { users } from '../../src/db/schema.js';
import * as sessionModule from '../../src/auth/session.js';
import * as userService from '../../src/services/user-service.js';
import { conflict } from '../../src/lib/app-error.js';

vi.mock('openid-client', () => ({
  discovery: vi.fn().mockResolvedValue({}),
  ClientSecretPost: (secret: string) => ({ secret }),
  authorizationCodeGrant: vi.fn(),
}));

async function createAuthedUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const [user] = await db
    .insert(users)
    .values({
      email: overrides.email ?? `user-${randomUUID()}@example.com`,
      name: overrides.name ?? 'Settings Tester',
      phone: overrides.phone ?? null,
    })
    .returning();

  const sessionId = `session-${randomUUID()}`;
  const now = new Date();
  vi.spyOn(sessionModule, 'getSession').mockResolvedValue({
    id: sessionId,
    user,
    createdAt: now,
    lastAccessedAt: now,
  });

  return { user, sessionId };
}

describe('routes/users', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetDb();
  });

  it('returns current user settings', async () => {
    const { user, sessionId } = await createAuthedUser({
      name: 'Ada Lovelace',
      phone: '050-1234567',
    });

    const res = await injectAuthed(app, sessionId, { method: 'GET', url: '/settings' });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { user: { id: string; name: string | null; phone: string | null } };
    expect(body.user).toMatchObject({ id: user.id, name: 'Ada Lovelace', phone: '050-1234567' });
  });

  it('updates user settings', async () => {
    const { user, sessionId } = await createAuthedUser({ name: 'Initial Name', phone: null });

    const res = await injectAuthed(app, sessionId, {
      method: 'PUT',
      url: '/settings',
      payload: { name: 'Updated Name', phone: '050-7654321' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { user: { id: string; name: string | null; phone: string | null } };
    expect(body.user).toMatchObject({ id: user.id, name: 'Updated Name', phone: '050-7654321' });

    const row = await db.query.users.findFirst({
      where: (table, { eq }) => eq(table.id, user.id),
    });
    expect(row?.name).toBe('Updated Name');
    expect(row?.phone).toBe('050-7654321');
  });

  it('returns conflict when phone number already exists', async () => {
    const { sessionId } = await createAuthedUser();

    vi.spyOn(userService, 'updateSettingsForUser').mockRejectedValue(
      conflict({ code: 'duplicate_phone' })
    );

    const res = await injectAuthed(app, sessionId, {
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      method: 'PUT',
      url: '/settings',
      payload: { phone: '050-1111111' },
    });

    vi.restoreAllMocks();

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'duplicate_phone' });
  });
});
