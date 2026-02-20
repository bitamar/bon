import { describe, expect, it, vi } from 'vitest';
import { injectAuthed } from '../utils/inject.js';
import * as customerService from '../../src/services/customer-service.js';
import { conflict } from '../../src/lib/app-error.js';
import {
  createOwnerWithBusiness,
  createAuthedUser,
  createTestBusiness,
  createUser,
} from '../utils/businesses.js';
import { setupIntegrationTest } from '../utils/server.js';

describe('routes/customers', () => {
  const ctx = setupIntegrationTest();

  describe('POST /businesses/:businessId/customers', () => {
    it('creates a customer with name only', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'POST',
        url: `/businesses/${business.id}/customers`,
        payload: { name: 'Acme Corp' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { customer: { name: string; taxId: null } };
      expect(body.customer.name).toBe('Acme Corp');
      expect(body.customer.taxId).toBeNull();
    });

    it('creates a customer with full fields', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'POST',
        url: `/businesses/${business.id}/customers`,
        payload: {
          name: 'Acme Corp',
          taxId: '123456789',
          taxIdType: 'company_id',
          isLicensedDealer: true,
          email: 'acme@example.com',
          city: 'Tel Aviv',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { customer: { taxId: string; isLicensedDealer: boolean } };
      expect(body.customer.taxId).toBe('123456789');
      expect(body.customer.isLicensedDealer).toBe(true);
    });

    it('returns 401 when unauthenticated', async () => {
      const ownerUser = await createUser();
      const business = await createTestBusiness(ownerUser.id);

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/businesses/${business.id}/customers`,
        payload: { name: 'Test' },
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 404 for non-member business', async () => {
      const { sessionId } = await createAuthedUser();
      const ownerUser = await createUser();
      const business = await createTestBusiness(ownerUser.id);

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'POST',
        url: `/businesses/${business.id}/customers`,
        payload: { name: 'Test' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 409 for duplicate tax ID', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      vi.spyOn(customerService, 'createCustomer').mockRejectedValueOnce(
        conflict({ code: 'duplicate_tax_id' })
      );

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'POST',
        url: `/businesses/${business.id}/customers`,
        payload: { name: 'Acme', taxId: '123456789' },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'duplicate_tax_id' });
    });
  });

  describe('GET /businesses/:businessId/customers', () => {
    it('returns customer list for a member', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'GET',
        url: `/businesses/${business.id}/customers`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { customers: unknown[] };
      expect(Array.isArray(body.customers)).toBe(true);
    });

    it('accepts q and active query params', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'GET',
        url: `/businesses/${business.id}/customers?q=acme&active=true`,
      });

      expect(res.statusCode).toBe(200);
    });

    it('returns 404 for non-member', async () => {
      const { sessionId } = await createAuthedUser();
      const ownerUser = await createUser();
      const business = await createTestBusiness(ownerUser.id);

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'GET',
        url: `/businesses/${business.id}/customers`,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /businesses/:businessId/customers/:customerId', () => {
    it('returns customer by id', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const createRes = await injectAuthed(ctx.app, sessionId, {
        method: 'POST',
        url: `/businesses/${business.id}/customers`,
        payload: { name: 'Test Customer' },
      });
      const { customer } = createRes.json() as { customer: { id: string } };

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'GET',
        url: `/businesses/${business.id}/customers/${customer.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { customer: { id: string; name: string } };
      expect(body.customer.id).toBe(customer.id);
      expect(body.customer.name).toBe('Test Customer');
    });

    it('returns 404 for non-existent customer', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'GET',
        url: `/businesses/${business.id}/customers/00000000-0000-0000-0000-000000000000`,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /businesses/:businessId/customers/:customerId', () => {
    it('updates customer name', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const createRes = await injectAuthed(ctx.app, sessionId, {
        method: 'POST',
        url: `/businesses/${business.id}/customers`,
        payload: { name: 'Old Name' },
      });
      const { customer } = createRes.json() as { customer: { id: string } };

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'PUT',
        url: `/businesses/${business.id}/customers/${customer.id}`,
        payload: { name: 'New Name' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { customer: { name: string } };
      expect(body.customer.name).toBe('New Name');
    });
  });

  describe('DELETE /businesses/:businessId/customers/:customerId', () => {
    it('soft-deletes a customer (sets isActive=false)', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const createRes = await injectAuthed(ctx.app, sessionId, {
        method: 'POST',
        url: `/businesses/${business.id}/customers`,
        payload: { name: 'To Delete' },
      });
      const { customer } = createRes.json() as { customer: { id: string } };

      const delRes = await injectAuthed(ctx.app, sessionId, {
        method: 'DELETE',
        url: `/businesses/${business.id}/customers/${customer.id}`,
      });

      expect(delRes.statusCode).toBe(200);
      expect(delRes.json()).toMatchObject({ ok: true });

      // Verify it's inactive
      const getRes = await injectAuthed(ctx.app, sessionId, {
        method: 'GET',
        url: `/businesses/${business.id}/customers/${customer.id}`,
      });
      const body = getRes.json() as { customer: { isActive: boolean } };
      expect(body.customer.isActive).toBe(false);
    });
  });
});
