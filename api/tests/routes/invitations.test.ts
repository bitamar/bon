import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/app.js';
import { resetDb } from '../utils/db.js';
import { injectAuthed } from '../utils/inject.js';
import { db } from '../../src/db/client.js';
import { users, businesses, userBusinesses, businessInvitations } from '../../src/db/schema.js';
import * as sessionModule from '../../src/auth/session.js';

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
      name: overrides.name ?? 'Tester',
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

async function createTestBusiness(
  userId: string,
  overrides: Partial<typeof businesses.$inferInsert> = {}
) {
  const now = new Date();
  const [business] = await db
    .insert(businesses)
    .values({
      name: 'Test Business',
      businessType: 'licensed_dealer',
      registrationNumber: `REG-${randomUUID().slice(0, 9)}`,
      streetAddress: '1 Main St',
      city: 'Tel Aviv',
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .returning();
  return business!;
}

async function addUserToBusiness(
  userId: string,
  businessId: string,
  role: 'owner' | 'admin' | 'user'
) {
  const [ub] = await db
    .insert(userBusinesses)
    .values({ userId, businessId, role, createdAt: new Date() })
    .returning();
  return ub!;
}

async function createPendingInvitation(
  businessId: string,
  invitedByUserId: string,
  email: string,
  role: 'admin' | 'user' = 'user'
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [inv] = await db
    .insert(businessInvitations)
    .values({
      businessId,
      email,
      role,
      invitedByUserId,
      token: randomUUID(),
      status: 'pending',
      expiresAt,
      createdAt: now,
    })
    .returning();
  return inv!;
}

describe('routes/invitations', () => {
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

  describe('POST /businesses/:businessId/invitations', () => {
    it('allows owner to invite a user', async () => {
      const { user, sessionId } = await createAuthedUser();
      const business = await createTestBusiness(user.id);
      await addUserToBusiness(user.id, business.id, 'owner');

      const res = await injectAuthed(app, sessionId, {
        method: 'POST',
        url: `/businesses/${business.id}/invitations`,
        payload: { email: 'invite@example.com', role: 'user' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true });
    });

    it('returns 404 for user with role=user', async () => {
      const { user, sessionId } = await createAuthedUser();

      const [ownerUser] = await db
        .insert(users)
        .values({ email: `owner-${randomUUID()}@example.com`, name: 'Owner' })
        .returning();
      const business = await createTestBusiness(ownerUser!.id);
      await addUserToBusiness(ownerUser!.id, business.id, 'owner');
      await addUserToBusiness(user.id, business.id, 'user');

      const res = await injectAuthed(app, sessionId, {
        method: 'POST',
        url: `/businesses/${business.id}/invitations`,
        payload: { email: 'invite@example.com', role: 'user' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 409 for duplicate pending invitation', async () => {
      const { user, sessionId } = await createAuthedUser();
      const business = await createTestBusiness(user.id);
      await addUserToBusiness(user.id, business.id, 'owner');

      const inviteeEmail = `invitee-${randomUUID()}@example.com`;
      await createPendingInvitation(business.id, user.id, inviteeEmail);

      const res = await injectAuthed(app, sessionId, {
        method: 'POST',
        url: `/businesses/${business.id}/invitations`,
        payload: { email: inviteeEmail, role: 'user' },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'invitation_already_exists' });
    });
  });

  describe('GET /businesses/:businessId/invitations', () => {
    it('returns invitations list for owner', async () => {
      const { user, sessionId } = await createAuthedUser();
      const business = await createTestBusiness(user.id);
      await addUserToBusiness(user.id, business.id, 'owner');
      await createPendingInvitation(business.id, user.id, `inv-${randomUUID()}@example.com`);

      const res = await injectAuthed(app, sessionId, {
        method: 'GET',
        url: `/businesses/${business.id}/invitations`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { invitations: { id: string }[] };
      expect(Array.isArray(body.invitations)).toBe(true);
      expect(body.invitations.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /invitations/mine', () => {
    it('returns pending invitations for the authenticated user', async () => {
      const inviteeEmail = `invitee-${randomUUID()}@example.com`;
      const { sessionId } = await createAuthedUser({ email: inviteeEmail });

      const [ownerUser] = await db
        .insert(users)
        .values({ email: `owner-${randomUUID()}@example.com`, name: 'Owner' })
        .returning();
      const business = await createTestBusiness(ownerUser!.id);
      await createPendingInvitation(business.id, ownerUser!.id, inviteeEmail);

      const res = await injectAuthed(app, sessionId, {
        method: 'GET',
        url: '/invitations/mine',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { invitations: { email?: string }[] };
      expect(Array.isArray(body.invitations)).toBe(true);
      expect(body.invitations.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /invitations/:token/accept', () => {
    it('accepts a valid invitation', async () => {
      const inviteeEmail = `invitee-${randomUUID()}@example.com`;
      const { sessionId } = await createAuthedUser({ email: inviteeEmail });

      const [ownerUser] = await db
        .insert(users)
        .values({ email: `owner-${randomUUID()}@example.com`, name: 'Owner' })
        .returning();
      const business = await createTestBusiness(ownerUser!.id);
      const inv = await createPendingInvitation(business.id, ownerUser!.id, inviteeEmail);

      const res = await injectAuthed(app, sessionId, {
        method: 'POST',
        url: `/invitations/${inv.token}/accept`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true });
    });

    it('returns 403 when invitation email does not match user email', async () => {
      const { sessionId } = await createAuthedUser({ email: `user-${randomUUID()}@example.com` });

      const [ownerUser] = await db
        .insert(users)
        .values({ email: `owner-${randomUUID()}@example.com`, name: 'Owner' })
        .returning();
      const business = await createTestBusiness(ownerUser!.id);
      const inv = await createPendingInvitation(
        business.id,
        ownerUser!.id,
        `different-${randomUUID()}@example.com`
      );

      const res = await injectAuthed(app, sessionId, {
        method: 'POST',
        url: `/invitations/${inv.token}/accept`,
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /invitations/:token/decline', () => {
    it('declines a valid invitation', async () => {
      const inviteeEmail = `invitee-${randomUUID()}@example.com`;
      const { sessionId } = await createAuthedUser({ email: inviteeEmail });

      const [ownerUser] = await db
        .insert(users)
        .values({ email: `owner-${randomUUID()}@example.com`, name: 'Owner' })
        .returning();
      const business = await createTestBusiness(ownerUser!.id);
      const inv = await createPendingInvitation(business.id, ownerUser!.id, inviteeEmail);

      const res = await injectAuthed(app, sessionId, {
        method: 'POST',
        url: `/invitations/${inv.token}/decline`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true });
    });
  });
});
