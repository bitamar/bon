import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { injectAuthed } from '../utils/inject.js';
import {
  createAuthedUser,
  createUser,
  createTestBusiness,
  createOwnerWithBusiness,
  addUserToBusiness,
} from '../utils/businesses.js';
import { setupIntegrationTest } from '../utils/server.js';

describe('plugins/business-context', () => {
  const ctx = setupIntegrationTest();

  describe('requireBusinessAccess', () => {
    it('sets businessContext for a member and allows access', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await injectAuthed(ctx.app, sessionId, {
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
      const otherUser = await createUser({ email: `other-${randomUUID()}@example.com` });
      const business = await createTestBusiness(otherUser.id);

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'GET',
        url: `/businesses/${business.id}`,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('requireBusinessRole', () => {
    it('allows owner to access an owner/admin-only route', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'PATCH',
        url: `/businesses/${business.id}`,
        payload: { name: 'New Name' },
      });

      expect(res.statusCode).toBe(200);
    });

    it('returns 403 when user role is insufficient (role=user)', async () => {
      const { user, sessionId } = await createAuthedUser();
      const ownerUser = await createUser();
      const business = await createTestBusiness(ownerUser.id);
      await addUserToBusiness(ownerUser.id, business.id, 'owner');
      await addUserToBusiness(user.id, business.id, 'user');

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'PATCH',
        url: `/businesses/${business.id}`,
        payload: { name: 'Hacked Name' },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('ensureBusinessContext', () => {
    it('returns 404 when no userBusiness found for a non-existent businessId', async () => {
      const { sessionId } = await createAuthedUser();

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'GET',
        url: `/businesses/${randomUUID()}`,
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
