import { describe, expect, it, vi } from 'vitest';
import { injectAuthed } from '../utils/inject.js';
import * as businessService from '../../src/services/business-service.js';
import { conflict } from '../../src/lib/app-error.js';
import {
  makeRegNum,
  createAuthedUser,
  createUser,
  createTestBusiness,
  createOwnerWithBusiness,
  createMemberInBusiness,
  addUserToBusiness,
} from '../utils/businesses.js';
import { setupIntegrationTest } from '../utils/server.js';

vi.mock('openid-client', () => ({
  discovery: vi.fn().mockResolvedValue({}),
  ClientSecretPost: (secret: string) => ({ secret }),
  authorizationCodeGrant: vi.fn(),
}));

describe('routes/businesses', () => {
  const ctx = setupIntegrationTest();

  describe('POST /businesses', () => {
    it('creates a business and returns it with role=owner', async () => {
      const { sessionId } = await createAuthedUser();

      const res = await injectAuthed(ctx.app, sessionId, {
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
      const res = await ctx.app.inject({
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

      const res = await injectAuthed(ctx.app, sessionId, {
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
      const { user, sessionId, business: biz1 } = await createOwnerWithBusiness();
      const biz2 = await createTestBusiness(user.id);
      await addUserToBusiness(user.id, biz2.id, 'admin');

      vi.spyOn(businessService, 'listBusinessesForUser').mockResolvedValueOnce({
        businesses: [
          {
            id: biz1.id,
            name: biz1.name,
            businessType: biz1.businessType,
            registrationNumber: biz1.registrationNumber,
            isActive: biz1.isActive,
            role: 'owner',
          },
          {
            id: biz2.id,
            name: biz2.name,
            businessType: biz2.businessType,
            registrationNumber: biz2.registrationNumber,
            isActive: biz2.isActive,
            role: 'admin',
          },
        ],
      });

      const res = await injectAuthed(ctx.app, sessionId, {
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
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'GET',
        url: `/businesses/${business.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { business: { id: string } };
      expect(body.business.id).toBe(business.id);
    });

    it('returns 404 for non-member', async () => {
      const { sessionId } = await createAuthedUser();
      const otherUser = await createUser();
      const business = await createTestBusiness(otherUser.id);

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'GET',
        url: `/businesses/${business.id}`,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /businesses/:businessId', () => {
    it('updates business for owner', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'PUT',
        url: `/businesses/${business.id}`,
        payload: { name: 'Updated Name' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { business: { name: string } };
      expect(body.business.name).toBe('Updated Name');
    });

    it('returns 404 for user with role=user', async () => {
      const { sessionId, business } = await createMemberInBusiness('user');

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'PUT',
        url: `/businesses/${business.id}`,
        payload: { name: 'Hacked Name' },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /businesses/:businessId/team', () => {
    it('returns team array for member', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await injectAuthed(ctx.app, sessionId, {
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
      const { sessionId, business } = await createOwnerWithBusiness();
      const member = await createUser();
      await addUserToBusiness(member.id, business.id, 'user');

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'DELETE',
        url: `/businesses/${business.id}/team/${member.id}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true });
    });

    it('returns 403 when trying to remove an owner', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const otherOwner = await createUser();
      await addUserToBusiness(otherOwner.id, business.id, 'owner');

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'DELETE',
        url: `/businesses/${business.id}/team/${otherOwner.id}`,
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
