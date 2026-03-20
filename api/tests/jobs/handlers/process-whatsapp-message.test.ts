import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Job } from 'pg-boss';
import type { JobPayloads } from '../../../src/jobs/boss.js';
import { createProcessWhatsAppMessageHandler } from '../../../src/jobs/handlers/process-whatsapp-message.js';

// ── module-scope mocks ──

const mockFindConversationById = vi.fn();
vi.mock('../../../src/repositories/whatsapp-repository.js', () => ({
  findConversationById: (...args: unknown[]) => mockFindConversationById(...args),
}));

const mockSendJob = vi.fn();
vi.mock('../../../src/jobs/boss.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/jobs/boss.js')>();
  return {
    ...original,
    sendJob: (...args: unknown[]) => mockSendJob(...args),
  };
});

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(),
  level: 'info',
  silent: vi.fn(),
} as never;

const mockBoss = {} as never;

function makeJob(
  data: JobPayloads['process-whatsapp-message']
): Job<JobPayloads['process-whatsapp-message']> {
  return {
    id: 'job-1',
    name: 'process-whatsapp-message',
    data,
  } as Job<JobPayloads['process-whatsapp-message']>;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('process-whatsapp-message handler', () => {
  it('enqueues a placeholder reply when conversation exists', async () => {
    mockFindConversationById.mockResolvedValue({
      id: 'conv-1',
      phone: '+972521234567',
    });

    const handler = createProcessWhatsAppMessageHandler(mockLogger, mockBoss);
    await handler(makeJob({ conversationId: 'conv-1', messageId: 'msg-1' }));

    expect(mockSendJob).toHaveBeenCalledWith(
      mockBoss,
      'send-whatsapp-reply',
      expect.objectContaining({
        conversationId: 'conv-1',
        body: expect.stringContaining('בפיתוח'),
        to: '+972521234567',
      }),
      expect.objectContaining({
        retryLimit: 5,
        retryDelay: 10,
        retryBackoff: true,
      })
    );
  });

  it('does not enqueue reply when conversation is not found', async () => {
    mockFindConversationById.mockResolvedValue(null);

    const handler = createProcessWhatsAppMessageHandler(mockLogger, mockBoss);
    await handler(makeJob({ conversationId: 'conv-missing', messageId: 'msg-1' }));

    expect(mockSendJob).not.toHaveBeenCalled();
  });
});
