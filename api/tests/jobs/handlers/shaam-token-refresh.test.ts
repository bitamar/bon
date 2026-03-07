import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { createShaamTokenRefreshHandler } from '../../../src/jobs/handlers/shaam-token-refresh.js';
import {
  upsertShaamCredentials,
  findShaamCredentialsByBusinessId,
} from '../../../src/repositories/shaam-credentials-repository.js';
import { encrypt } from '../../../src/lib/crypto.js';
import { resetDb } from '../../utils/db.js';
import { createUser, createTestBusiness } from '../../utils/businesses.js';
import { makeLogger, makeJob } from '../../utils/jobs.js';

const TEST_KEY = 'a'.repeat(64);

async function seedExpiringCredentials(businessId: string, minutesUntilExpiry: number) {
  return upsertShaamCredentials({
    businessId,
    encryptedAccessToken: encrypt('access-token-' + randomUUID(), TEST_KEY),
    encryptedRefreshToken: encrypt('refresh-token-' + randomUUID(), TEST_KEY),
    tokenExpiresAt: new Date(Date.now() + minutesUntilExpiry * 60_000),
    scope: 'shaam:allocate',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

let logger: FastifyBaseLogger;

async function runHandler() {
  const handler = createShaamTokenRefreshHandler(logger);
  await handler(makeJob('shaam-token-refresh'));
}

async function seedExpiringBusiness(minutesUntilExpiry: number) {
  const user = await createUser();
  const biz = await createTestBusiness(user.id);
  await seedExpiringCredentials(biz.id, minutesUntilExpiry);
  return biz;
}

describe('shaam-token-refresh handler', () => {
  beforeEach(async () => {
    await resetDb();
    logger = makeLogger();
    vi.stubEnv('SHAAM_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does nothing when no credentials are expiring', async () => {
    await runHandler();

    expect(logger.debug).toHaveBeenCalledWith('shaam-token-refresh: no expiring credentials');
  });

  it('marks credentials as needsReauth when refresh fails (T13 not implemented)', async () => {
    const biz = await seedExpiringBusiness(10); // Expires in 10 min (within 20 min buffer)

    await runHandler();

    const cred = await findShaamCredentialsByBusinessId(biz.id);
    expect(cred!.needsReauth).toBe(true);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: biz.id }),
      'shaam-token-refresh: refresh failed, marking needsReauth'
    );
  });

  it('processes multiple businesses independently', async () => {
    const biz1 = await seedExpiringBusiness(5);
    const biz2 = await seedExpiringBusiness(15);

    await runHandler();

    // Both should be marked needsReauth (since T13 refresh is not implemented)
    const cred1 = await findShaamCredentialsByBusinessId(biz1.id);
    const cred2 = await findShaamCredentialsByBusinessId(biz2.id);
    expect(cred1!.needsReauth).toBe(true);
    expect(cred2!.needsReauth).toBe(true);

    expect(logger.info).toHaveBeenCalledWith(
      { count: 2 },
      'shaam-token-refresh: refreshing expiring tokens'
    );
  });

  it('skips credentials that are not expiring soon', async () => {
    const biz = await seedExpiringBusiness(120); // Expires in 2 hours

    await runHandler();

    const cred = await findShaamCredentialsByBusinessId(biz.id);
    expect(cred!.needsReauth).toBe(false);
    expect(logger.debug).toHaveBeenCalledWith('shaam-token-refresh: no expiring credentials');
  });
});
