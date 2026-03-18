import { describe, it, expect, vi } from 'vitest';
import { runJob } from '../../src/jobs/boss.js';
import type { Job } from 'pg-boss';

// ── helpers ──

function makeLogger() {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as never;
}

function makeJob(value: string): Job<{ value: string }> {
  return { id: 'job-1', name: '__test-job', data: { value } } as Job<{ value: string }>;
}

describe('runJob', () => {
  it('calls the handler for each job in the batch', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const wrapper = runJob('__test-job', handler, makeLogger());

    await wrapper([makeJob('a'), makeJob('b')]);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('logs job started and completed on success', async () => {
    const logger = makeLogger();
    const handler = vi.fn().mockResolvedValue(undefined);
    const wrapper = runJob('__test-job', handler, logger);

    await wrapper([makeJob('ok')]);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ jobName: '__test-job', jobId: 'job-1' }),
      'job started'
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        jobName: '__test-job',
        jobId: 'job-1',
        durationMs: expect.any(Number),
      }),
      'job completed'
    );
  });

  it('logs error and re-throws when handler fails', async () => {
    const logger = makeLogger();
    const handlerError = new Error('boom');
    const handler = vi.fn().mockRejectedValue(handlerError);
    const wrapper = runJob('__test-job', handler, logger);

    await expect(wrapper([makeJob('fail')])).rejects.toThrow('boom');

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ jobName: '__test-job', jobId: 'job-1', err: handlerError }),
      'job failed'
    );
  });
});
