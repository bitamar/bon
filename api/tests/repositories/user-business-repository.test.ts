import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { resetDb } from '../utils/db.js';
import {
  findUserBusiness,
  insertUserBusiness,
  findBusinessesForUser,
} from '../../src/repositories/user-business-repository.js';
import { createUser, createTestBusiness } from '../utils/businesses.js';

describe('user-business-repository', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  describe('insertUserBusiness', () => {
    it('inserts and returns a user-business record', async () => {
      const user = await createUser();
      const business = await createTestBusiness(user.id);

      const result = await insertUserBusiness({
        userId: user.id,
        businessId: business.id,
        role: 'owner',
      });

      expect(result).not.toBeNull();
      expect(result?.userId).toBe(user.id);
      expect(result?.businessId).toBe(business.id);
      expect(result?.role).toBe('owner');
    });
  });

  describe('findUserBusiness', () => {
    it('finds a user-business record by userId and businessId', async () => {
      const user = await createUser();
      const business = await createTestBusiness(user.id);

      await insertUserBusiness({ userId: user.id, businessId: business.id, role: 'owner' });

      const result = await findUserBusiness(user.id, business.id);

      expect(result).not.toBeNull();
      expect(result?.userId).toBe(user.id);
      expect(result?.businessId).toBe(business.id);
      expect(result?.role).toBe('owner');
    });

    it('returns null if the record does not exist', async () => {
      const result = await findUserBusiness(randomUUID(), randomUUID());

      expect(result).toBeNull();
    });
  });

  describe('findBusinessesForUser', () => {
    it('returns a list with role and business details for a user', async () => {
      const user = await createUser();
      const business = await createTestBusiness(user.id);

      await insertUserBusiness({ userId: user.id, businessId: business.id, role: 'owner' });

      const results = await findBusinessesForUser(user.id);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(business.id);
      expect(results[0].name).toBe(business.name);
      expect(results[0].role).toBe('owner');
      expect(results[0].businessType).toBe(business.businessType);
      expect(results[0].registrationNumber).toBe(business.registrationNumber);
    });

    it('returns an empty list when the user has no businesses', async () => {
      const user = await createUser();
      const results = await findBusinessesForUser(user.id);
      expect(results).toHaveLength(0);
    });
  });
});
