import type { FastifyBaseLogger } from 'fastify';
import type { Job } from 'pg-boss';
import type { JobPayloads } from '../boss.js';
import {
  findExpiringCredentials,
  markNeedsReauth,
} from '../../repositories/shaam-credentials-repository.js';
import { decrypt } from '../../lib/crypto.js';
import { env } from '../../env.js';

const TOKEN_BUFFER_MINUTES = 20;

/**
 * Creates the shaam-token-refresh cron handler.
 * Each business is refreshed independently — one failure does not block others.
 *
 * The actual HTTP call to the SHAAM token endpoint is deferred to T13.
 * Until then, expiring credentials are marked as needing re-auth.
 */
export function createShaamTokenRefreshHandler(
  logger: FastifyBaseLogger
): (job: Job<JobPayloads['shaam-token-refresh']>) => Promise<void> {
  return async (_job) => {
    const credentials = await findExpiringCredentials(TOKEN_BUFFER_MINUTES);

    if (credentials.length === 0) {
      logger.debug('shaam-token-refresh: no expiring credentials');
      return;
    }

    logger.info({ count: credentials.length }, 'shaam-token-refresh: refreshing expiring tokens');

    for (const cred of credentials) {
      try {
        await refreshOne(cred.businessId, cred.encryptedRefreshToken);
        logger.info({ businessId: cred.businessId }, 'shaam-token-refresh: token refreshed');
      } catch (err: unknown) {
        logger.error(
          { businessId: cred.businessId, err },
          'shaam-token-refresh: refresh failed, marking needsReauth'
        );
        try {
          await markNeedsReauth(cred.businessId);
        } catch (markErr: unknown) {
          logger.error(
            { businessId: cred.businessId, err: markErr },
            'shaam-token-refresh: failed to mark needsReauth'
          );
        }
      }
    }
  };
}

/**
 * Refresh a single business's SHAAM token.
 *
 * T13 will replace the throw with a real HTTP call to the SHAAM OAuth2
 * token endpoint. For now, we validate the crypto layer works (decrypt
 * succeeds) then throw because there is no endpoint to call yet.
 */
async function refreshOne(businessId: string, encryptedRefreshToken: string): Promise<void> {
  const encryptionKey = env.SHAAM_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error(`No SHAAM_ENCRYPTION_KEY configured for business ${businessId}`);
  }

  // Validate we can decrypt the refresh token (proves crypto layer works)
  decrypt(encryptedRefreshToken, encryptionKey);

  // T13: call SHAAM OAuth2 token endpoint with the decrypted refresh token,
  // then upsert the new access + refresh tokens.
  throw new Error('Token refresh HTTP call not yet implemented — see T13');
}
