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
      whatsappEnabled: overrides.whatsappEnabled ?? true,
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

  it('returns current user settings with whatsappEnabled', async () => {
    const { user, sessionId } = await createAuthedUser({
      name: 'Ada Lovelace',
      phone: '+972501234567',
      whatsappEnabled: true,
    });

    const res = await injectAuthed(app, sessionId, { method: 'GET', url: '/settings' });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      user: { id: string; name: string | null; phone: string | null; whatsappEnabled: boolean };
    };
    expect(body.user).toMatchObject({
      id: user.id,
      name: 'Ada Lovelace',
      phone: '+972501234567',
      whatsappEnabled: true,
    });
  });

  it('updates user settings with phone normalized to E.164', async () => {
    const { user, sessionId } = await createAuthedUser({ name: 'Initial Name', phone: null });

    const res = await injectAuthed(app, sessionId, {
      method: 'PATCH',
      url: '/settings',
      payload: { name: 'Updated Name', phone: '050-7654321' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      user: { id: string; name: string | null; phone: string | null; whatsappEnabled: boolean };
    };
    expect(body.user).toMatchObject({
      id: user.id,
      name: 'Updated Name',
      phone: '+972507654321',
      whatsappEnabled: true,
    });

    const row = await db.query.users.findFirst({
      where: (table, { eq }) => eq(table.id, user.id),
    });
    expect(row?.name).toBe('Updated Name');
    expect(row?.phone).toBe('+972507654321');
  });

  it('accepts various phone formats and normalizes to E.164', async () => {
    const { sessionId } = await createAuthedUser();

    const formats = ['052-1234567', '052 1234567', '0521234567', '+972521234567'];
    for (const format of formats) {
      const res = await injectAuthed(app, sessionId, {
        method: 'PATCH',
        url: '/settings',
        payload: { phone: format },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { user: { phone: string | null } };
      expect(body.user.phone).toBe('+972521234567');
    }
  });

  it('returns 400 for invalid phone format', async () => {
    const { sessionId } = await createAuthedUser();

    const res = await injectAuthed(app, sessionId, {
      method: 'PATCH',
      url: '/settings',
      payload: { phone: '123' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_phone' });
  });

  it('returns conflict when phone number already exists', async () => {
    const { sessionId } = await createAuthedUser();

    vi.spyOn(userService, 'updateSettingsForUser').mockRejectedValue(
      conflict({ code: 'duplicate_phone', message: 'מספר טלפון זה כבר בשימוש' })
    );

    const res = await injectAuthed(app, sessionId, {
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      method: 'PATCH',
      url: '/settings',
      payload: { phone: '050-1111111' },
    });

    vi.restoreAllMocks();

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'duplicate_phone' });
  });

  it('409 response does not contain the phone number', async () => {
    const { sessionId } = await createAuthedUser();

    vi.spyOn(userService, 'updateSettingsForUser').mockRejectedValue(
      conflict({ code: 'duplicate_phone', message: 'מספר טלפון זה כבר בשימוש' })
    );

    const res = await injectAuthed(app, sessionId, {
      method: 'PATCH',
      url: '/settings',
      payload: { phone: '050-1111111' },
    });

    vi.restoreAllMocks();

    const text = JSON.stringify(res.json());
    expect(text).not.toContain('050-1111111');
    expect(text).not.toContain('+972501111111');
  });

  it('updates whatsappEnabled to false', async () => {
    const { user, sessionId } = await createAuthedUser({ whatsappEnabled: true });

    const res = await injectAuthed(app, sessionId, {
      method: 'PATCH',
      url: '/settings',
      payload: { whatsappEnabled: false },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { user: { id: string; whatsappEnabled: boolean } };
    expect(body.user).toMatchObject({ id: user.id, whatsappEnabled: false });

    const row = await db.query.users.findFirst({
      where: (table, { eq }) => eq(table.id, user.id),
    });
    expect(row?.whatsappEnabled).toBe(false);
  });

  it('allows multiple users with null phone (partial unique index)', async () => {
    await createAuthedUser({ phone: null });
    const { sessionId: session2 } = await createAuthedUser({
      email: `user2-${randomUUID()}@example.com`,
      phone: null,
    });

    const res = await injectAuthed(app, session2, { method: 'GET', url: '/settings' });
    expect(res.statusCode).toBe(200);
  });
});
