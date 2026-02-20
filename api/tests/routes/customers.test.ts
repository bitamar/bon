import { describe, expect, it } from 'vitest';
import { injectAuthed } from '../utils/inject.js';
import {
  createOwnerWithBusiness,
  createAuthedUser,
  createTestBusiness,
  createUser,
} from '../utils/businesses.js';
import { setupIntegrationTest } from '../utils/server.js';

// ── module-level helpers ────────────────────────────────────────────────────

async function setupNonMemberScenario() {
  const { sessionId } = await createAuthedUser();
  const ownerUser = await createUser();
  const business = await createTestBusiness(ownerUser.id);
  return { sessionId, business };
}

// Valid Israeli ID numbers (pass Luhn-variant checksum)
const VALID_TAX_ID_1 = '515303055';
const VALID_TAX_ID_2 = '515303063';
const INVALID_CHECKSUM_TAX_ID = '123456789';

describe('routes/customers', () => {
  const ctx = setupIntegrationTest();

  // ── helpers ────────────────────────────────────────────────────────────────

  async function postCustomer(sessionId: string, businessId: string, payload: object) {
    return injectAuthed(ctx.app, sessionId, {
      method: 'POST',
      url: `/businesses/${businessId}/customers`,
      payload,
    });
  }

  async function patchCustomer(
    sessionId: string,
    businessId: string,
    customerId: string,
    payload: object
  ) {
    return injectAuthed(ctx.app, sessionId, {
      method: 'PATCH',
      url: `/businesses/${businessId}/customers/${customerId}`,
      payload,
    });
  }

  async function getCustomers(sessionId: string, businessId: string, query = '') {
    const qs = query ? `?${query}` : '';
    return injectAuthed(ctx.app, sessionId, {
      method: 'GET',
      url: `/businesses/${businessId}/customers${qs}`,
    });
  }

  async function createTestCustomer(
    sessionId: string,
    businessId: string,
    payload: object = { name: 'Test Customer' }
  ) {
    const res = await postCustomer(sessionId, businessId, payload);
    return (res.json() as { customer: { id: string } }).customer;
  }

  // ── POST ───────────────────────────────────────────────────────────────────

  describe('POST /businesses/:businessId/customers', () => {
    it('creates a customer with name only', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await postCustomer(sessionId, business.id, { name: 'Acme Corp' });

      expect(res.statusCode).toBe(201);
      const body = res.json() as { customer: { name: string; taxId: null } };
      expect(body.customer.name).toBe('Acme Corp');
      expect(body.customer.taxId).toBeNull();
    });

    it('creates a customer with full fields', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await postCustomer(sessionId, business.id, {
        name: 'Acme Corp',
        taxId: VALID_TAX_ID_1,
        taxIdType: 'company_id',
        isLicensedDealer: true,
        email: 'acme@example.com',
        city: 'Tel Aviv',
      });

      expect(res.statusCode).toBe(201);
      const body = res.json() as { customer: { taxId: string; isLicensedDealer: boolean } };
      expect(body.customer.taxId).toBe(VALID_TAX_ID_1);
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
      const { sessionId, business } = await setupNonMemberScenario();
      const res = await postCustomer(sessionId, business.id, { name: 'Test' });
      expect(res.statusCode).toBe(404);
    });

    it('returns 409 for duplicate taxId with existing customer info', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      await postCustomer(sessionId, business.id, {
        name: 'Original Customer',
        taxId: VALID_TAX_ID_1,
        taxIdType: 'company_id',
      });

      const res = await postCustomer(sessionId, business.id, {
        name: 'Duplicate Attempt',
        taxId: VALID_TAX_ID_1,
        taxIdType: 'company_id',
      });

      expect(res.statusCode).toBe(409);
      const body = res.json() as {
        error: string;
        details: { existingCustomerId: string; existingCustomerName: string };
      };
      expect(body.error).toBe('duplicate_tax_id');
      expect(body.details.existingCustomerName).toBe('Original Customer');
      expect(body.details.existingCustomerId).toBeTruthy();
    });

    it('allows same taxId in different businesses', async () => {
      // Create users sequentially — each createAuthedUser() overwrites the session mock,
      // so we must use each session before creating the next user.
      const { sessionId: s1, business: b1 } = await createOwnerWithBusiness();
      const res1 = await postCustomer(s1, b1.id, {
        name: 'A',
        taxId: VALID_TAX_ID_1,
        taxIdType: 'company_id',
      });

      const { sessionId: s2, business: b2 } = await createOwnerWithBusiness();
      const res2 = await postCustomer(s2, b2.id, {
        name: 'B',
        taxId: VALID_TAX_ID_1,
        taxIdType: 'company_id',
      });

      expect(res1.statusCode).toBe(201);
      expect(res2.statusCode).toBe(201);
    });

    it('allows multiple customers with null taxId in same business', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res1 = await postCustomer(sessionId, business.id, { name: 'No Tax 1' });
      const res2 = await postCustomer(sessionId, business.id, { name: 'No Tax 2' });

      expect(res1.statusCode).toBe(201);
      expect(res2.statusCode).toBe(201);
    });

    it('returns 400 when isLicensedDealer=true without taxId', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await postCustomer(sessionId, business.id, {
        name: 'Acme Corp',
        isLicensedDealer: true,
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for invalid checksum on company_id', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await postCustomer(sessionId, business.id, {
        name: 'Bad ID',
        taxId: INVALID_CHECKSUM_TAX_ID,
        taxIdType: 'company_id',
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for invalid checksum on personal_id', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await postCustomer(sessionId, business.id, {
        name: 'Bad ID',
        taxId: INVALID_CHECKSUM_TAX_ID,
        taxIdType: 'personal_id',
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ── GET list ───────────────────────────────────────────────────────────────

  describe('GET /businesses/:businessId/customers', () => {
    it('returns customer list for a member', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await getCustomers(sessionId, business.id);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray((res.json() as { customers: unknown[] }).customers)).toBe(true);
    });

    it('filters by name query', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      await createTestCustomer(sessionId, business.id, { name: 'Alpha Corp' });
      await createTestCustomer(sessionId, business.id, { name: 'Beta Inc' });

      const res = await getCustomers(sessionId, business.id, 'q=alpha');
      const body = res.json() as { customers: { name: string }[] };

      expect(res.statusCode).toBe(200);
      expect(body.customers).toHaveLength(1);
      expect(body.customers[0]?.name).toBe('Alpha Corp');
    });

    it('filters by taxId query', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      await createTestCustomer(sessionId, business.id, {
        name: 'With Tax',
        taxId: VALID_TAX_ID_1,
        taxIdType: 'company_id',
      });
      await createTestCustomer(sessionId, business.id, { name: 'No Tax' });

      const res = await getCustomers(sessionId, business.id, 'q=5153');
      const body = res.json() as { customers: { name: string }[] };

      expect(res.statusCode).toBe(200);
      expect(body.customers).toHaveLength(1);
      expect(body.customers[0]?.name).toBe('With Tax');
    });

    it('hides inactive customers by default', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const customer = await createTestCustomer(sessionId, business.id, { name: 'Active' });
      const toDelete = await createTestCustomer(sessionId, business.id, { name: 'Deleted' });
      await injectAuthed(ctx.app, sessionId, {
        method: 'DELETE',
        url: `/businesses/${business.id}/customers/${toDelete.id}`,
      });

      const res = await getCustomers(sessionId, business.id);
      const body = res.json() as { customers: { id: string }[] };

      expect(body.customers).toHaveLength(1);
      expect(body.customers[0]?.id).toBe(customer.id);
    });

    it('shows inactive customers when active=false', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      await createTestCustomer(sessionId, business.id, { name: 'Active' });
      const toDelete = await createTestCustomer(sessionId, business.id, { name: 'Deleted' });
      await injectAuthed(ctx.app, sessionId, {
        method: 'DELETE',
        url: `/businesses/${business.id}/customers/${toDelete.id}`,
      });

      const res = await getCustomers(sessionId, business.id, 'active=false');
      const body = res.json() as { customers: { name: string }[] };

      expect(body.customers).toHaveLength(2);
    });

    it('returns 404 for non-member', async () => {
      const { sessionId, business } = await setupNonMemberScenario();

      const res = await getCustomers(sessionId, business.id);

      expect(res.statusCode).toBe(404);
    });
  });

  // ── GET single ─────────────────────────────────────────────────────────────

  describe('GET /businesses/:businessId/customers/:customerId', () => {
    it('returns customer by id', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const customer = await createTestCustomer(sessionId, business.id);

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

  // ── PATCH ──────────────────────────────────────────────────────────────────

  describe('PATCH /businesses/:businessId/customers/:customerId', () => {
    it('updates customer name', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const customer = await createTestCustomer(sessionId, business.id, { name: 'Old Name' });

      const res = await patchCustomer(sessionId, business.id, customer.id, { name: 'New Name' });

      expect(res.statusCode).toBe(200);
      expect((res.json() as { customer: { name: string } }).customer.name).toBe('New Name');
    });

    it('returns 409 when updating taxId to a duplicate', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      await createTestCustomer(sessionId, business.id, {
        name: 'Original',
        taxId: VALID_TAX_ID_1,
        taxIdType: 'company_id',
      });
      const other = await createTestCustomer(sessionId, business.id, {
        name: 'Other',
        taxId: VALID_TAX_ID_2,
        taxIdType: 'company_id',
      });

      const res = await patchCustomer(sessionId, business.id, other.id, {
        taxId: VALID_TAX_ID_1,
      });

      expect(res.statusCode).toBe(409);
      expect((res.json() as { error: string }).error).toBe('duplicate_tax_id');
    });

    it('clears deletedAt when re-activating a customer', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const customer = await createTestCustomer(sessionId, business.id, { name: 'Reactivate Me' });

      // Soft-delete
      await injectAuthed(ctx.app, sessionId, {
        method: 'DELETE',
        url: `/businesses/${business.id}/customers/${customer.id}`,
      });

      // Re-activate
      const res = await patchCustomer(sessionId, business.id, customer.id, { isActive: true });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { customer: { isActive: boolean; deletedAt: string | null } };
      expect(body.customer.isActive).toBe(true);
      expect(body.customer.deletedAt).toBeNull();
    });
  });

  // ── DELETE ─────────────────────────────────────────────────────────────────

  describe('DELETE /businesses/:businessId/customers/:customerId', () => {
    it('soft-deletes a customer (sets isActive=false and deletedAt)', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const customer = await createTestCustomer(sessionId, business.id, { name: 'To Delete' });

      const delRes = await injectAuthed(ctx.app, sessionId, {
        method: 'DELETE',
        url: `/businesses/${business.id}/customers/${customer.id}`,
      });

      expect(delRes.statusCode).toBe(200);
      expect(delRes.json()).toMatchObject({ ok: true });

      const getRes = await injectAuthed(ctx.app, sessionId, {
        method: 'GET',
        url: `/businesses/${business.id}/customers/${customer.id}`,
      });
      const c = (getRes.json() as { customer: { isActive: boolean; deletedAt: string | null } })
        .customer;
      expect(c.isActive).toBe(false);
      expect(c.deletedAt).not.toBeNull();
    });
  });
});
