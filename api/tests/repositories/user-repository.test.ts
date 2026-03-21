import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { resetDb } from '../utils/db.js';
import { db } from '../../src/db/client.js';
import { users } from '../../src/db/schema.js';
import { updateUserById, findUserByPhone } from '../../src/repositories/user-repository.js';

async function createTestUser() {
  const [user] = await db
    .insert(users)
    .values({ email: `user-repo-${randomUUID()}@example.com`, name: 'Original Name' })
    .returning();
  return user;
}

describe('user-repository', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  describe('updateUserById', () => {
    it('updates the name field and returns the updated record', async () => {
      const user = await createTestUser();

      const result = await updateUserById(user.id, { name: 'Updated Name' });

      expect(result).not.toBeNull();
      expect(result?.id).toBe(user.id);
      expect(result?.name).toBe('Updated Name');
      expect(result?.email).toBe(user.email);
    });

    it('returns null for an unknown user id', async () => {
      const result = await updateUserById(randomUUID(), { name: 'Ghost User' });

      expect(result).toBeNull();
    });
  });

  describe('findUserByPhone', () => {
    it('returns the user for a known E.164 phone number', async () => {
      const user = await createTestUser();
      await updateUserById(user.id, { phone: '+972521234567' });

      const result = await findUserByPhone('+972521234567');

      expect(result).not.toBeNull();
      expect(result?.id).toBe(user.id);
      expect(result?.phone).toBe('+972521234567');
    });

    it('returns null for an unregistered phone number', async () => {
      const result = await findUserByPhone('+972599999999');

      expect(result).toBeNull();
    });

    it('returns null when no users have a phone set', async () => {
      await createTestUser(); // user with phone = null

      const result = await findUserByPhone('+972521234567');

      expect(result).toBeNull();
    });
  });
});
