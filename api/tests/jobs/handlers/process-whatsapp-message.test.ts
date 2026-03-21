import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createProcessWhatsAppMessageHandler } from '../../../src/jobs/handlers/process-whatsapp-message.js';
import { makeLogger, makeJob } from '../../utils/jobs.js';

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

const mockLogger = makeLogger();
const mockBoss = {} as never;

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
    await handler(
      makeJob('process-whatsapp-message', { conversationId: 'conv-1', messageId: 'msg-1' })
    );

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
    await handler(
      makeJob('process-whatsapp-message', { conversationId: 'conv-missing', messageId: 'msg-1' })
    );

    expect(mockSendJob).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-missing' }),
      expect.stringContaining('conversation not found')
    );
  });
});
