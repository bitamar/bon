import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { resetDb } from '../utils/db.js';
import {
  insertBusiness,
  findBusinessById,
  updateBusiness,
  type BusinessInsert,
} from '../../src/repositories/business-repository.js';
import { createUser, createTestBusiness } from '../utils/businesses.js';

// ── helpers ──

function buildBusinessData(
  userId: string,
  overrides: Partial<BusinessInsert> = {}
): BusinessInsert {
  return {
    name: 'Test Biz',
    businessType: 'exempt_dealer' as const,
    registrationNumber: randomUUID(),
    createdByUserId: userId,
    ...overrides,
  };
}

describe('business-repository', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  // ── soft-delete CHECK constraint ────────────────────────────────────────

  describe('soft-delete CHECK constraint', () => {
    it('rejects inserting isActive=false without deletedAt', async () => {
      const user = await createUser();

      await expect(
        insertBusiness(buildBusinessData(user.id, { isActive: false }))
      ).rejects.toThrow();
    });

    it('rejects inserting isActive=true with deletedAt set', async () => {
      const user = await createUser();

      await expect(
        insertBusiness(buildBusinessData(user.id, { isActive: true, deletedAt: new Date() }))
      ).rejects.toThrow();
    });

    it('allows inserting isActive=false with deletedAt set', async () => {
      const user = await createUser();

      const result = await insertBusiness(
        buildBusinessData(user.id, { isActive: false, deletedAt: new Date() })
      );

      expect(result).not.toBeNull();
      expect(result?.isActive).toBe(false);
      expect(result?.deletedAt).not.toBeNull();
    });
  });

  describe('insertBusiness', () => {
    it('inserts and returns a business record', async () => {
      const user = await createUser();
      const regNum = randomUUID();

      const result = await insertBusiness({
        name: 'My Shop',
        businessType: 'exempt_dealer',
        registrationNumber: regNum,
        streetAddress: '5 HaYarkon St',
        city: 'Haifa',
        createdByUserId: user.id,
      });

      expect(result).not.toBeNull();
      expect(result?.name).toBe('My Shop');
      expect(result?.businessType).toBe('exempt_dealer');
      expect(result?.registrationNumber).toBe(regNum);
      expect(result?.streetAddress).toBe('5 HaYarkon St');
      expect(result?.city).toBe('Haifa');
      expect(result?.createdByUserId).toBe(user.id);
      expect(result?.id).toBeTruthy();
      expect(result?.isActive).toBe(true);
    });
  });

  describe('findBusinessById', () => {
    it('finds a business by id', async () => {
      const user = await createUser();
      const business = await createTestBusiness(user.id);

      const result = await findBusinessById(business.id);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(business.id);
      expect(result?.name).toBe(business.name);
    });

    it('returns null for an unknown id', async () => {
      const result = await findBusinessById(randomUUID());

      expect(result).toBeNull();
    });
  });

  describe('updateBusiness', () => {
    it('updates the name field and returns the updated record', async () => {
      const user = await createUser();
      const business = await createTestBusiness(user.id);

      const result = await updateBusiness(business.id, { name: 'Updated Name' });

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Updated Name');
      expect(result?.id).toBe(business.id);
    });

    it('returns null for an unknown id', async () => {
      const result = await updateBusiness(randomUUID(), { name: 'Does Not Exist' });

      expect(result).toBeNull();
    });
  });
});
