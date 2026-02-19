import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { randomInt, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/app.js';
import { resetDb } from '../utils/db.js';
import { injectAuthed } from '../utils/inject.js';
import { db } from '../../src/db/client.js';
import { users, businesses, userBusinesses } from '../../src/db/schema.js';
import * as sessionModule from '../../src/auth/session.js';

vi.mock('openid-client', () => ({
  discovery: vi.fn().mockResolvedValue({}),
  ClientSecretPost: (secret: string) => ({ secret }),
  authorizationCodeGrant: vi.fn(),
}));

// Registration numbers must be exactly 9 digits to pass response schema validation
function makeRegNum(): string {
  return String(randomInt(100_000_000, 1_000_000_000));
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

describe('plugins/business-context', () => {
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

  describe('requireBusinessAccess', () => {
    it('sets businessContext for a member and allows access', async () => {
      const { user, sessionId } = await createAuthedUser();
      const business = await createTestBusiness(user.id);
      await addUserToBusiness(user.id, business.id, 'owner');

      // GET /businesses/:businessId exercises requireBusinessAccess
      const res = await injectAuthed(app, sessionId, {
        method: 'GET',
        url: `/businesses/${business.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { business: { id: string }; role: string };
      expect(body.business.id).toBe(business.id);
      expect(body.role).toBe('owner');
    });

    it('returns 404 for a non-member', async () => {
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

  describe('requireBusinessRole', () => {
    it('allows owner to access an owner/admin-only route', async () => {
      const { user, sessionId } = await createAuthedUser();
      const business = await createTestBusiness(user.id);
      await addUserToBusiness(user.id, business.id, 'owner');

      // PUT /businesses/:businessId requires owner or admin
      const res = await injectAuthed(app, sessionId, {
        method: 'PUT',
        url: `/businesses/${business.id}`,
        payload: { name: 'New Name' },
      });

      expect(res.statusCode).toBe(200);
    });

    it('returns 404 when user role is insufficient (role=user)', async () => {
      const { user, sessionId } = await createAuthedUser();

      const [ownerUser] = await db
        .insert(users)
        .values({ email: `owner-${randomUUID()}@example.com`, name: 'Owner' })
        .returning();
      const business = await createTestBusiness(ownerUser!.id);
      await addUserToBusiness(ownerUser!.id, business.id, 'owner');
      await addUserToBusiness(user.id, business.id, 'user');

      // PUT /businesses/:businessId requires owner or admin; user with role=user should be blocked
      const res = await injectAuthed(app, sessionId, {
        method: 'PUT',
        url: `/businesses/${business.id}`,
        payload: { name: 'Hacked Name' },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('ensureBusinessContext', () => {
    it('returns 404 when no userBusiness found for a non-existent businessId', async () => {
      const { sessionId } = await createAuthedUser();
      const fakeId = randomUUID();

      const res = await injectAuthed(app, sessionId, {
        method: 'GET',
        url: `/businesses/${fakeId}`,
      });

      // requireBusinessAccess throws notFound when no userBusiness found
      expect(res.statusCode).toBe(404);
    });
  });
});
