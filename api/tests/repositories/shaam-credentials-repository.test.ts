import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  findShaamCredentialsByBusinessId,
  upsertShaamCredentials,
  markNeedsReauth,
  findExpiringCredentials,
} from '../../src/repositories/shaam-credentials-repository.js';
import { resetDb } from '../utils/db.js';
import { createUser, createTestBusiness } from '../utils/businesses.js';

// ── helpers ──

async function seedBusiness() {
  const user = await createUser();
  return createTestBusiness(user.id);
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

  describe('findExpiringCredentials', () => {
    it('returns credentials expiring within the buffer window', async () => {
      const data = makeCredentialData(businessId);
      // Token expires 10 minutes from now — within the 20-minute buffer
      data.tokenExpiresAt = new Date(Date.now() + 10 * 60_000);
      await upsertShaamCredentials(data);

      const results = await findExpiringCredentials(20);
      expect(results).toHaveLength(1);
      expect(results[0]!.businessId).toBe(businessId);
    });

    it('excludes credentials not expiring within the buffer window', async () => {
      const data = makeCredentialData(businessId);
      // Token expires 2 hours from now — well outside 20-minute buffer
      data.tokenExpiresAt = new Date(Date.now() + 2 * 3_600_000);
      await upsertShaamCredentials(data);

      const results = await findExpiringCredentials(20);
      expect(results).toHaveLength(0);
    });

    it('excludes credentials already marked as needsReauth', async () => {
      const data = makeCredentialData(businessId);
      data.tokenExpiresAt = new Date(Date.now() + 10 * 60_000);
      await upsertShaamCredentials(data);
      await markNeedsReauth(businessId);

      const results = await findExpiringCredentials(20);
      expect(results).toHaveLength(0);
    });

    it('returns multiple expiring credentials from different businesses', async () => {
      const biz2 = await seedBusiness();

      const data1 = makeCredentialData(businessId);
      data1.tokenExpiresAt = new Date(Date.now() + 5 * 60_000);
      await upsertShaamCredentials(data1);

      const data2 = makeCredentialData(biz2.id);
      data2.tokenExpiresAt = new Date(Date.now() + 15 * 60_000);
      await upsertShaamCredentials(data2);

      const results = await findExpiringCredentials(20);
      expect(results).toHaveLength(2);
    });
  });
});
