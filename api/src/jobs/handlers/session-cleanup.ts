import type { FastifyBaseLogger } from 'fastify';
import { lt, sql } from 'drizzle-orm';
import type { Job } from 'pg-boss';
import type { JobPayloads } from '../boss.js';
import { db } from '../../db/client.js';
import { sessions } from '../../db/schema.js';

/**
 * Creates the session-cleanup cron handler.
 * Deletes sessions whose expiresAt is in the past.
 * The session_expires_idx index ensures efficient deletion.
 */
export function createSessionCleanupHandler(
  logger: FastifyBaseLogger
): (job: Job<JobPayloads['session-cleanup']>) => Promise<void> {
  return async (_job) => {
    const deleted = await db
      .delete(sessions)
      .where(lt(sessions.expiresAt, sql`NOW()`))
      .returning({ id: sessions.id });

    logger.info({ count: deleted.length }, 'session-cleanup: deleted expired sessions');
  };
}
