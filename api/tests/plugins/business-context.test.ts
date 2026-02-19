import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { injectAuthed } from '../utils/inject.js';
import {
  createAuthedUser,
  createUser,
  createTestBusiness,
  createOwnerWithBusiness,
  createMemberInBusiness,
} from '../utils/businesses.js';
import { setupIntegrationTest } from '../utils/server.js';

vi.mock('openid-client', () => ({
  discovery: vi.fn().mockResolvedValue({}),
  ClientSecretPost: (secret: string) => ({ secret }),
  authorizationCodeGrant: vi.fn(),
}));

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
        method: 'PUT',
        url: `/businesses/${business.id}`,
        payload: { name: 'New Name' },
      });

      expect(res.statusCode).toBe(200);
    });

    it('returns 404 when user role is insufficient (role=user)', async () => {
      const { sessionId, business } = await createMemberInBusiness('user');

      const res = await injectAuthed(ctx.app, sessionId, {
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

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'GET',
        url: `/businesses/${randomUUID()}`,
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
