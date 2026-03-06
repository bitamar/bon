import { describe, expect, it, beforeEach } from 'vitest';
import { randomInt, randomUUID } from 'node:crypto';
import { db } from '../../src/db/client.js';
import { businesses, users } from '../../src/db/schema.js';
import {
  findShaamCredentialsByBusinessId,
  upsertShaamCredentials,
  markNeedsReauth,
} from '../../src/repositories/shaam-credentials-repository.js';
import { resetDb } from '../utils/db.js';

// ── helpers ──

async function seedBusiness() {
  const [user] = await db
    .insert(users)
    .values({ email: `user-${randomUUID()}@test.com`, name: 'Test' })
    .returning();
  const now = new Date();
  const [biz] = await db
    .insert(businesses)
    .values({
      name: 'Test Biz',
      businessType: 'licensed_dealer',
      registrationNumber: String(randomInt(100_000_000, 1_000_000_000)),
      createdByUserId: user!.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return biz!;
}

function makeCredentialData(businessId: string) {
  const now = new Date();
  return {
    businessId,
    encryptedAccessToken: 'enc-access-' + randomUUID(),
    encryptedRefreshToken: 'enc-refresh-' + randomUUID(),
    tokenExpiresAt: new Date(now.getTime() + 3_600_000),
    scope: 'shaam:allocate',
    createdAt: now,
    updatedAt: now,
  };
}

describe('shaam-credentials-repository', () => {
  let businessId: string;

  beforeEach(async () => {
    await resetDb();
    const biz = await seedBusiness();
    businessId = biz.id;
  });

  describe('findShaamCredentialsByBusinessId', () => {
    it('returns null when no credentials exist', async () => {
      const result = await findShaamCredentialsByBusinessId(businessId);
      expect(result).toBeNull();
    });

    it('returns credentials when they exist', async () => {
      const data = makeCredentialData(businessId);
      await upsertShaamCredentials(data);
      const result = await findShaamCredentialsByBusinessId(businessId);

      expect(result).not.toBeNull();
      expect(result!.businessId).toBe(businessId);
      expect(result!.encryptedAccessToken).toBe(data.encryptedAccessToken);
      expect(result!.encryptedRefreshToken).toBe(data.encryptedRefreshToken);
      expect(result!.scope).toBe('shaam:allocate');
      expect(result!.needsReauth).toBe(false);
    });
  });

  describe('upsertShaamCredentials', () => {
    it('inserts new credentials', async () => {
      const data = makeCredentialData(businessId);
      const result = await upsertShaamCredentials(data);

      expect(result.businessId).toBe(businessId);
      expect(result.encryptedAccessToken).toBe(data.encryptedAccessToken);
    });

    it('updates existing credentials on conflict (same businessId)', async () => {
      const data1 = makeCredentialData(businessId);
      await upsertShaamCredentials(data1);

      const data2 = makeCredentialData(businessId);
      const result = await upsertShaamCredentials(data2);

      expect(result.encryptedAccessToken).toBe(data2.encryptedAccessToken);
      expect(result.encryptedRefreshToken).toBe(data2.encryptedRefreshToken);
    });

    it('clears needsReauth on upsert', async () => {
      const data = makeCredentialData(businessId);
      await upsertShaamCredentials(data);
      await markNeedsReauth(businessId);

      // Verify it was set
      const before = await findShaamCredentialsByBusinessId(businessId);
      expect(before!.needsReauth).toBe(true);

      // Upsert should clear it
      await upsertShaamCredentials(makeCredentialData(businessId));
      const after = await findShaamCredentialsByBusinessId(businessId);
      expect(after!.needsReauth).toBe(false);
    });
  });

  describe('markNeedsReauth', () => {
    it('sets needsReauth to true', async () => {
      await upsertShaamCredentials(makeCredentialData(businessId));
      await markNeedsReauth(businessId);

      const result = await findShaamCredentialsByBusinessId(businessId);
      expect(result!.needsReauth).toBe(true);
    });

    it('does nothing when no credentials exist (no error)', async () => {
      // Should not throw
      await markNeedsReauth(businessId);
      const result = await findShaamCredentialsByBusinessId(businessId);
      expect(result).toBeNull();
    });
  });
});
