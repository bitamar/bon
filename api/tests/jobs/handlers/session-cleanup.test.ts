import { describe, expect, it, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Job } from 'pg-boss';
import type { FastifyBaseLogger } from 'fastify';
import type { JobPayloads } from '../../../src/jobs/boss.js';
import { createSessionCleanupHandler } from '../../../src/jobs/handlers/session-cleanup.js';
import { db } from '../../../src/db/client.js';
import { sessions } from '../../../src/db/schema.js';
import { resetDb } from '../../utils/db.js';
import { createUser } from '../../utils/businesses.js';

function makeJob(): Job<JobPayloads['session-cleanup']> {
  return { id: randomUUID(), name: 'session-cleanup', data: {} } as Job<
    JobPayloads['session-cleanup']
  >;
}

function makeLogger(): FastifyBaseLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    level: 'info',
    silent: vi.fn(),
  } as unknown as FastifyBaseLogger;
}

async function createSession(userId: string, expiresInMs: number) {
  const now = new Date();
  const [row] = await db
    .insert(sessions)
    .values({
      id: randomUUID(),
      userId,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt: new Date(now.getTime() + expiresInMs),
    })
    .returning();
  return row!;
}

let logger: FastifyBaseLogger;
let userId: string;

async function runHandler() {
  const handler = createSessionCleanupHandler(logger);
  await handler(makeJob());
}

describe('session-cleanup handler', () => {
  beforeEach(async () => {
    await resetDb();
    logger = makeLogger();
    const user = await createUser();
    userId = user.id;
  });

  it('deletes expired sessions', async () => {
    const expired = await createSession(userId, -60_000); // expired 1 min ago
    const valid = await createSession(userId, 60 * 60_000); // expires in 1 hour

    await runHandler();

    const remaining = await db.select().from(sessions);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(valid.id);
    expect(remaining.some((r) => r.id === expired.id)).toBe(false);
    expect(logger.info).toHaveBeenCalledWith(
      { count: 1 },
      'session-cleanup: deleted expired sessions'
    );
  });

  it('handles no expired sessions', async () => {
    await createSession(userId, 60 * 60_000);

    await runHandler();

    const remaining = await db.select().from(sessions);
    expect(remaining).toHaveLength(1);
    expect(logger.info).toHaveBeenCalledWith(
      { count: 0 },
      'session-cleanup: deleted expired sessions'
    );
  });
});
