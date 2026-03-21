import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createSendWhatsAppReplyHandler } from '../../../src/jobs/handlers/send-whatsapp-reply.js';
import type {
  WhatsAppService,
  WhatsAppSendResult,
} from '../../../src/services/whatsapp/whatsapp-types.js';
import { makeLogger, makeJob } from '../../utils/jobs.js';

// ── module-scope mocks ──

const mockSendMessage = vi.fn<(to: string, body: string) => Promise<WhatsAppSendResult>>();
const mockWhatsApp: WhatsAppService = { sendMessage: mockSendMessage };

const mockInsertMessage = vi.fn();
vi.mock('../../../src/repositories/whatsapp-repository.js', () => ({
  insertMessage: (...args: unknown[]) => mockInsertMessage(...args),
}));

const mockLogger = makeLogger();

beforeEach(() => {
  vi.resetAllMocks();
});

describe('send-whatsapp-reply handler', () => {
  it('stores outbound message on successful send', async () => {
    mockSendMessage.mockResolvedValue({ status: 'sent', messageSid: 'SM123' });
    mockInsertMessage.mockResolvedValue({ id: 'msg-1' });

    const handler = createSendWhatsAppReplyHandler(mockWhatsApp, mockLogger);
    await handler(
      makeJob('send-whatsapp-reply', {
        conversationId: 'conv-1',
        body: 'שלום',
        to: '+972521234567',
      })
    );

    expect(mockSendMessage).toHaveBeenCalledWith('+972521234567', 'שלום');
    expect(mockInsertMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        twilioSid: 'SM123',
        direction: 'outbound',
        llmRole: 'assistant',
        body: 'שלום',
      })
    );
  });

  it('throws on retryable failure so pg-boss retries', async () => {
    mockSendMessage.mockResolvedValue({ status: 'failed', error: 'Rate limited', retryable: true });

    const handler = createSendWhatsAppReplyHandler(mockWhatsApp, mockLogger);

    await expect(
      handler(
        makeJob('send-whatsapp-reply', {
          conversationId: 'conv-1',
          body: 'test',
          to: '+972521234567',
        })
      )
    ).rejects.toThrow('retryable');

    expect(mockInsertMessage).not.toHaveBeenCalled();
  });

  it('does not throw on non-retryable failure', async () => {
    mockSendMessage.mockResolvedValue({
      status: 'failed',
      error: 'User opted out',
      retryable: false,
    });

    const handler = createSendWhatsAppReplyHandler(mockWhatsApp, mockLogger);

    await expect(
      handler(
        makeJob('send-whatsapp-reply', {
          conversationId: 'conv-1',
          body: 'test',
          to: '+972521234567',
        })
      )
    ).resolves.toBeUndefined();

    expect(mockInsertMessage).not.toHaveBeenCalled();
  });
});
