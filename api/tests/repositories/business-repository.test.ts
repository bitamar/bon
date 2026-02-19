import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { resetDb } from '../utils/db.js';
import { db } from '../../src/db/client.js';
import { businesses, users } from '../../src/db/schema.js';
import {
  insertBusiness,
  findBusinessById,
  updateBusiness,
} from '../../src/repositories/business-repository.js';

async function createTestUser() {
  const [user] = await db
    .insert(users)
    .values({ email: `biz-repo-${randomUUID()}@example.com`, name: 'Test User' })
    .returning();
  return user;
}

async function createTestBusiness(userId: string) {
  const [business] = await db
    .insert(businesses)
    .values({
      name: 'Test Business',
      businessType: 'licensed_dealer',
      registrationNumber: randomUUID(),
      streetAddress: '1 Main St',
      city: 'Tel Aviv',
      createdByUserId: userId,
    })
    .returning();
  return business;
}

describe('business-repository', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  describe('insertBusiness', () => {
    it('inserts and returns a business record with correct fields', async () => {
      const user = await createTestUser();
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
      const user = await createTestUser();
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
      const user = await createTestUser();
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
