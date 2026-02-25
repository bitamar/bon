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
  addUserToBusiness,
} from '../utils/businesses.js';
import { setupIntegrationTest } from '../utils/server.js';

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
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json() as { business: { name: string }; role: string };
      expect(body.business.name).toBe('My Shop');
      expect(body.role).toBe('owner');
    });

    it('creates a business with only name, businessType, and registrationNumber', async () => {
      const { sessionId } = await createAuthedUser();

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'POST',
        url: '/businesses',
        payload: {
          name: 'Minimal Biz',
          businessType: 'licensed_dealer',
          registrationNumber: makeRegNum(),
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json() as { business: { streetAddress: unknown; city: unknown } };
      expect(body.business.streetAddress).toBeNull();
      expect(body.business.city).toBeNull();
    });

    it('returns 401 when unauthenticated', async () => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/businesses',
        payload: {
          name: 'My Shop',
          businessType: 'licensed_dealer',
          registrationNumber: makeRegNum(),
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 400 for exempt_dealer with invalid ת.ז. checksum', async () => {
      const { sessionId } = await createAuthedUser();

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'POST',
        url: '/businesses',
        payload: {
          name: 'Freelancer',
          businessType: 'exempt_dealer',
          registrationNumber: '123456789',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('creates exempt_dealer with valid ת.ז.', async () => {
      const { sessionId } = await createAuthedUser();

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'POST',
        url: '/businesses',
        payload: {
          name: 'Freelancer',
          businessType: 'exempt_dealer',
          registrationNumber: '515303055',
        },
      });

      expect(res.statusCode).toBe(201);
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

  describe('PATCH /businesses/:businessId', () => {
    it('updates business for owner', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'PATCH',
        url: `/businesses/${business.id}`,
        payload: { name: 'Updated Name' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { business: { name: string } };
      expect(body.business.name).toBe('Updated Name');
    });

    it('returns 404 for non-member', async () => {
      const { sessionId } = await createAuthedUser();
      const otherUser = await createUser();
      const business = await createTestBusiness(otherUser.id);

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'PATCH',
        url: `/businesses/${business.id}`,
        payload: { name: 'Hacked Name' },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
