import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/app.js';
import { resetDb } from '../utils/db.js';
import { injectAuthed } from '../utils/inject.js';
import { db } from '../../src/db/client.js';
import { users, businesses, userBusinesses } from '../../src/db/schema.js';
import * as sessionModule from '../../src/auth/session.js';
import * as businessService from '../../src/services/business-service.js';
import { conflict } from '../../src/lib/app-error.js';

vi.mock('openid-client', () => ({
  discovery: vi.fn().mockResolvedValue({}),
  ClientSecretPost: (secret: string) => ({ secret }),
  authorizationCodeGrant: vi.fn(),
}));

// Registration numbers must be exactly 9 digits to pass schema validation
function makeRegNum(): string {
  return String(Math.floor(100000000 + Math.random() * 900000000));
}

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
      registrationNumber: makeRegNum(),
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

describe('routes/businesses', () => {
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

  describe('POST /businesses', () => {
    it('creates a business and returns it with role=owner', async () => {
      const { sessionId } = await createAuthedUser();

      const res = await injectAuthed(app, sessionId, {
        method: 'POST',
        url: '/businesses',
        payload: {
          name: 'My Shop',
          businessType: 'licensed_dealer',
          registrationNumber: makeRegNum(),
          streetAddress: '5 Dizengoff St',
          city: 'Tel Aviv',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { business: { name: string }; role: string };
      expect(body.business.name).toBe('My Shop');
      expect(body.role).toBe('owner');
    });

    it('returns 401 when unauthenticated', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/businesses',
        payload: {
          name: 'My Shop',
          businessType: 'licensed_dealer',
          registrationNumber: makeRegNum(),
          streetAddress: '5 Dizengoff St',
          city: 'Tel Aviv',
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 409 for duplicate registrationNumber', async () => {
      const { sessionId } = await createAuthedUser();

      vi.spyOn(businessService, 'createBusiness').mockRejectedValueOnce(
        conflict({ code: 'duplicate_registration_number' })
      );

      const res = await injectAuthed(app, sessionId, {
        method: 'POST',
        url: '/businesses',
        payload: {
          name: 'Another Shop',
          businessType: 'licensed_dealer',
          registrationNumber: makeRegNum(),
          streetAddress: '10 HaYarkon St',
          city: 'Haifa',
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'duplicate_registration_number' });
    });
  });

  describe('GET /businesses', () => {
    it('returns list of all businesses the user belongs to', async () => {
      const { user, sessionId } = await createAuthedUser();

      const regNum1 = makeRegNum();
      const regNum2 = makeRegNum();
      const biz1 = await createTestBusiness(user.id, { registrationNumber: regNum1 });
      const biz2 = await createTestBusiness(user.id, { registrationNumber: regNum2 });
      await addUserToBusiness(user.id, biz1.id, 'owner');
      await addUserToBusiness(user.id, biz2.id, 'admin');

      vi.spyOn(businessService, 'listBusinessesForUser').mockResolvedValueOnce({
        businesses: [
          {
            id: biz1.id,
            name: biz1.name,
            businessType: biz1.businessType,
            registrationNumber: regNum1,
            isActive: biz1.isActive,
            role: 'owner',
          },
          {
            id: biz2.id,
            name: biz2.name,
            businessType: biz2.businessType,
            registrationNumber: regNum2,
            isActive: biz2.isActive,
            role: 'admin',
          },
        ],
      });

      const res = await injectAuthed(app, sessionId, {
        method: 'GET',
        url: '/businesses',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { businesses: { id: string }[] };
      expect(body.businesses).toHaveLength(2);
    });
  });

  describe('GET /businesses/:businessId', () => {
    it('returns business for a member', async () => {
      const { user, sessionId } = await createAuthedUser();
      const business = await createTestBusiness(user.id);
      await addUserToBusiness(user.id, business.id, 'owner');

      const res = await injectAuthed(app, sessionId, {
        method: 'GET',
        url: `/businesses/${business.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { business: { id: string } };
      expect(body.business.id).toBe(business.id);
    });

    it('returns 404 for non-member', async () => {
      const { sessionId } = await createAuthedUser();

      const [otherUser] = await db
        .insert(users)
        .values({ email: `other-${randomUUID()}@example.com`, name: 'Other' })
        .returning();
      const business = await createTestBusiness(otherUser!.id);

      const res = await injectAuthed(app, sessionId, {
        method: 'GET',
        url: `/businesses/${business.id}`,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /businesses/:businessId', () => {
    it('updates business for owner', async () => {
      const { user, sessionId } = await createAuthedUser();
      const business = await createTestBusiness(user.id);
      await addUserToBusiness(user.id, business.id, 'owner');

      const res = await injectAuthed(app, sessionId, {
        method: 'PUT',
        url: `/businesses/${business.id}`,
        payload: { name: 'Updated Name' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { business: { name: string } };
      expect(body.business.name).toBe('Updated Name');
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
        method: 'PUT',
        url: `/businesses/${business.id}`,
        payload: { name: 'Hacked Name' },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /businesses/:businessId/team', () => {
    it('returns team array for member', async () => {
      const { user, sessionId } = await createAuthedUser();
      const business = await createTestBusiness(user.id);
      await addUserToBusiness(user.id, business.id, 'owner');

      const res = await injectAuthed(app, sessionId, {
        method: 'GET',
        url: `/businesses/${business.id}/team`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { team: { userId: string }[] };
      expect(Array.isArray(body.team)).toBe(true);
      expect(body.team.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('DELETE /businesses/:businessId/team/:userId', () => {
    it('allows owner to remove a user-role member', async () => {
      const { user: owner, sessionId } = await createAuthedUser();
      const business = await createTestBusiness(owner.id);
      await addUserToBusiness(owner.id, business.id, 'owner');

      const [member] = await db
        .insert(users)
        .values({ email: `member-${randomUUID()}@example.com`, name: 'Member' })
        .returning();
      await addUserToBusiness(member!.id, business.id, 'user');

      const res = await injectAuthed(app, sessionId, {
        method: 'DELETE',
        url: `/businesses/${business.id}/team/${member!.id}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true });
    });

    it('returns 403 when trying to remove an owner', async () => {
      const { user: owner, sessionId } = await createAuthedUser();
      const business = await createTestBusiness(owner.id);
      await addUserToBusiness(owner.id, business.id, 'owner');

      const [otherOwner] = await db
        .insert(users)
        .values({ email: `owner2-${randomUUID()}@example.com`, name: 'Owner2' })
        .returning();
      await addUserToBusiness(otherOwner!.id, business.id, 'owner');

      const res = await injectAuthed(app, sessionId, {
        method: 'DELETE',
        url: `/businesses/${business.id}/team/${otherOwner!.id}`,
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
