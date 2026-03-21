import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import type { Job } from 'pg-boss';
import type { JobName, JobPayloads } from '../../src/jobs/boss.js';

export function makeLogger(): FastifyBaseLogger {
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

export function makeJob<N extends JobName>(
  name: N,
  data: JobPayloads[N] = {} as JobPayloads[N]
): Job<JobPayloads[N]> {
  return { id: randomUUID(), name, data } as Job<JobPayloads[N]>;
}
