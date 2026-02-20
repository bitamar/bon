import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { resetDb } from '../utils/db.js';
import {
  insertCustomer,
  findCustomerById,
  findCustomerByTaxId,
  updateCustomer,
  searchCustomers,
} from '../../src/repositories/customer-repository.js';
import { createUser, createTestBusiness } from '../utils/businesses.js';

// ── helpers ────────────────────────────────────────────────────────────────

async function setupBusiness() {
  const user = await createUser();
  const business = await createTestBusiness(user.id);
  return { user, business };
}

async function insertTestCustomer(businessId: string, overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return insertCustomer({
    businessId,
    name: 'Test Customer',
    taxId: null,
    taxIdType: 'none',
    isLicensedDealer: false,
    email: null,
    phone: null,
    streetAddress: null,
    city: null,
    postalCode: null,
    contactName: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('customer-repository', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  // ── insertCustomer ──────────────────────────────────────────────────────

  describe('insertCustomer', () => {
    it('inserts and returns a customer with correct fields', async () => {
      const { business } = await setupBusiness();

      const result = await insertTestCustomer(business.id, {
        name: 'Acme Corp',
        taxId: '515303055',
        taxIdType: 'company_id',
        isLicensedDealer: true,
        city: 'Tel Aviv',
      });

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Acme Corp');
      expect(result?.taxId).toBe('515303055');
      expect(result?.taxIdType).toBe('company_id');
      expect(result?.isLicensedDealer).toBe(true);
      expect(result?.city).toBe('Tel Aviv');
      expect(result?.businessId).toBe(business.id);
      expect(result?.isActive).toBe(true);
    });

    it('inserts a minimal customer with name only', async () => {
      const { business } = await setupBusiness();

      const result = await insertTestCustomer(business.id);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Test Customer');
      expect(result?.taxId).toBeNull();
    });
  });

  // ── findCustomerById ────────────────────────────────────────────────────

  describe('findCustomerById', () => {
    it('finds a customer by id within the correct business', async () => {
      const { business } = await setupBusiness();
      const customer = await insertTestCustomer(business.id, { name: 'Found Me' });

      const result = await findCustomerById(customer!.id, business.id);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Found Me');
    });

    it('returns null for a customer in a different business', async () => {
      const { business: biz1 } = await setupBusiness();
      const { business: biz2 } = await setupBusiness();
      const customer = await insertTestCustomer(biz1.id);

      const result = await findCustomerById(customer!.id, biz2.id);

      expect(result).toBeNull();
    });

    it('returns null for an unknown id', async () => {
      const { business } = await setupBusiness();

      const result = await findCustomerById(randomUUID(), business.id);

      expect(result).toBeNull();
    });
  });

  // ── findCustomerByTaxId ─────────────────────────────────────────────────

  describe('findCustomerByTaxId', () => {
    it('finds a customer by taxId within a business', async () => {
      const { business } = await setupBusiness();
      await insertTestCustomer(business.id, { name: 'Tax Match', taxId: '515303055' });

      const result = await findCustomerByTaxId(business.id, '515303055');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Tax Match');
    });

    it('returns null when taxId belongs to a different business', async () => {
      const { business: biz1 } = await setupBusiness();
      const { business: biz2 } = await setupBusiness();
      await insertTestCustomer(biz1.id, { taxId: '515303055' });

      const result = await findCustomerByTaxId(biz2.id, '515303055');

      expect(result).toBeNull();
    });

    it('returns null when taxId does not exist', async () => {
      const { business } = await setupBusiness();

      const result = await findCustomerByTaxId(business.id, '999999999');

      expect(result).toBeNull();
    });
  });

  // ── updateCustomer ──────────────────────────────────────────────────────

  describe('updateCustomer', () => {
    it('updates fields and returns the updated record', async () => {
      const { business } = await setupBusiness();
      const customer = await insertTestCustomer(business.id, { name: 'Old Name' });

      const result = await updateCustomer(customer!.id, business.id, { name: 'New Name' });

      expect(result).not.toBeNull();
      expect(result?.name).toBe('New Name');
    });

    it('returns null for a customer in a different business', async () => {
      const { business: biz1 } = await setupBusiness();
      const { business: biz2 } = await setupBusiness();
      const customer = await insertTestCustomer(biz1.id);

      const result = await updateCustomer(customer!.id, biz2.id, { name: 'Hacked' });

      expect(result).toBeNull();
    });

    it('returns null for an unknown id', async () => {
      const { business } = await setupBusiness();

      const result = await updateCustomer(randomUUID(), business.id, { name: 'Ghost' });

      expect(result).toBeNull();
    });
  });

  // ── searchCustomers ─────────────────────────────────────────────────────

  describe('searchCustomers', () => {
    it('returns customers matching name query', async () => {
      const { business } = await setupBusiness();
      await insertTestCustomer(business.id, { name: 'Alpha Corp' });
      await insertTestCustomer(business.id, { name: 'Beta Inc' });

      const results = await searchCustomers(business.id, 'alpha', true, 50);

      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe('Alpha Corp');
    });

    it('returns customers matching taxId query', async () => {
      const { business } = await setupBusiness();
      await insertTestCustomer(business.id, { name: 'With Tax', taxId: '515303055' });
      await insertTestCustomer(business.id, { name: 'No Tax' });

      const results = await searchCustomers(business.id, '5153', true, 50);

      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe('With Tax');
    });

    it('returns all active customers when no query', async () => {
      const { business } = await setupBusiness();
      await insertTestCustomer(business.id, { name: 'Active' });
      await insertTestCustomer(business.id, { name: 'Deleted', isActive: false });

      const results = await searchCustomers(business.id, undefined, true, 50);

      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe('Active');
    });

    it('returns inactive customers when activeOnly is false', async () => {
      const { business } = await setupBusiness();
      await insertTestCustomer(business.id, { name: 'Active' });
      await insertTestCustomer(business.id, { name: 'Deleted', isActive: false });

      const results = await searchCustomers(business.id, undefined, false, 50);

      expect(results).toHaveLength(2);
    });

    it('respects limit parameter', async () => {
      const { business } = await setupBusiness();
      await insertTestCustomer(business.id, { name: 'A' });
      await insertTestCustomer(business.id, { name: 'B' });
      await insertTestCustomer(business.id, { name: 'C' });

      const results = await searchCustomers(business.id, undefined, true, 2);

      expect(results).toHaveLength(2);
    });

    it('scopes results to the given business', async () => {
      const { business: biz1 } = await setupBusiness();
      const { business: biz2 } = await setupBusiness();
      await insertTestCustomer(biz1.id, { name: 'Biz1 Customer' });
      await insertTestCustomer(biz2.id, { name: 'Biz2 Customer' });

      const results = await searchCustomers(biz1.id, undefined, true, 50);

      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe('Biz1 Customer');
    });
  });
});
