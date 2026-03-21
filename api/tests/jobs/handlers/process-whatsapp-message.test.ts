import { describe, expect, it, vi, beforeEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { createProcessWhatsAppMessageHandler } from '../../../src/jobs/handlers/process-whatsapp-message.js';
import type { ClaudeClient } from '../../../src/services/llm/claude-client.js';
import type { ToolRegistry } from '../../../src/services/whatsapp/types.js';
import { createToolRegistry } from '../../../src/services/whatsapp/types.js';
import { makeLogger, makeJob } from '../../utils/jobs.js';

// ── module-scope mocks ──

const mockFindConversationById = vi.fn();
const mockFindRecentMessages = vi.fn();
const mockInsertMessage = vi.fn();
const mockUpdateConversation = vi.fn();
vi.mock('../../../src/repositories/whatsapp-repository.js', () => ({
  findConversationById: (...args: unknown[]) => mockFindConversationById(...args),
  findRecentMessages: (...args: unknown[]) => mockFindRecentMessages(...args),
  insertMessage: (...args: unknown[]) => mockInsertMessage(...args),
  updateConversation: (...args: unknown[]) => mockUpdateConversation(...args),
}));

const mockFindUserById = vi.fn();
vi.mock('../../../src/repositories/user-repository.js', () => ({
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
}));

const mockFindBusinessesForUser = vi.fn();
const mockFindUserBusiness = vi.fn();
vi.mock('../../../src/repositories/user-business-repository.js', () => ({
  findBusinessesForUser: (...args: unknown[]) => mockFindBusinessesForUser(...args),
  findUserBusiness: (...args: unknown[]) => mockFindUserBusiness(...args),
}));

const mockSendJob = vi.fn();
vi.mock('../../../src/jobs/boss.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/jobs/boss.js')>();
  return {
    ...original,
    sendJob: (...args: unknown[]) => mockSendJob(...args),
  };
});

const mockRunToolLoop = vi.fn();
vi.mock('../../../src/services/whatsapp/tool-loop.js', () => ({
  runToolLoop: (...args: unknown[]) => mockRunToolLoop(...args),
}));

// ── helpers (module scope per S2004) ──

const mockLogger = makeLogger();
const mockBoss = {} as never;

function makeConversation(overrides?: Record<string, unknown>) {
  return {
    id: 'conv-1',
    userId: 'user-1',
    phone: '+972521234567',
    activeBusinessId: null,
    status: 'active',
    lastActivityAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

function makeUser(overrides?: Record<string, unknown>) {
  return {
    id: 'user-1',
    name: 'יוסי כהן',
    email: 'yossi@example.com',
    phone: '+972521234567',
    whatsappEnabled: true,
    ...overrides,
  };
}

function makeBusiness(overrides?: Record<string, unknown>) {
  return {
    id: 'biz-1',
    name: 'חשמל בע"מ',
    role: 'owner',
    businessType: 'licensed_dealer',
    registrationNumber: '123456789',
    isActive: true,
    ...overrides,
  };
}

function makeClaudeClient(): ClaudeClient {
  return { sendMessage: vi.fn() };
}

function makeToolRegistry(): ToolRegistry {
  return createToolRegistry();
}

function setupHappyPath() {
  const conv = makeConversation();
  mockFindConversationById.mockResolvedValue(conv);
  mockFindUserById.mockResolvedValue(makeUser());
  mockFindBusinessesForUser.mockResolvedValue([makeBusiness()]);
  mockFindRecentMessages.mockResolvedValue([
    {
      id: 'msg-1',
      conversationId: 'conv-1',
      twilioSid: 'SM123',
      direction: 'inbound',
      llmRole: 'user',
      toolName: null,
      toolCallId: null,
      body: 'שלום',
      metadata: null,
      createdAt: new Date(),
    },
  ]);
  mockInsertMessage.mockResolvedValue({});
  mockUpdateConversation.mockResolvedValue({});
  mockRunToolLoop.mockResolvedValue('תשובה מהבוט');
  mockSendJob.mockResolvedValue('job-1');
}

function makeHandler() {
  return createProcessWhatsAppMessageHandler(
    mockLogger,
    mockBoss,
    makeClaudeClient(),
    makeToolRegistry()
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('process-whatsapp-message handler', () => {
  it('happy path: user with 1 business → auto-select → LLM called → reply enqueued', async () => {
    setupHappyPath();
    const handler = makeHandler();

    await handler(
      makeJob('process-whatsapp-message', { conversationId: 'conv-1', messageId: 'msg-1' })
    );

    // Auto-set activeBusinessId
    expect(mockUpdateConversation).toHaveBeenCalledWith('conv-1', { activeBusinessId: 'biz-1' });
    // Tool loop was called
    expect(mockRunToolLoop).toHaveBeenCalledTimes(1);
    // Reply enqueued
    expect(mockSendJob).toHaveBeenCalledWith(
      mockBoss,
      'send-whatsapp-reply',
      expect.objectContaining({
        conversationId: 'conv-1',
        body: 'תשובה מהבוט',
        to: '+972521234567',
      }),
      expect.objectContaining({ retryLimit: 5 })
    );
    // lastActivityAt updated
    expect(mockUpdateConversation).toHaveBeenCalledWith('conv-1', {
      lastActivityAt: expect.any(Date),
    });
  });

  it('does nothing when conversation is not found', async () => {
    mockFindConversationById.mockResolvedValue(null);
    const handler = makeHandler();

    await handler(
      makeJob('process-whatsapp-message', { conversationId: 'missing', messageId: 'msg-1' })
    );

    expect(mockRunToolLoop).not.toHaveBeenCalled();
    expect(mockSendJob).not.toHaveBeenCalled();
  });

  it('does nothing when user is not found', async () => {
    mockFindConversationById.mockResolvedValue(makeConversation());
    mockFindUserById.mockResolvedValue(null);
    const handler = makeHandler();

    await handler(
      makeJob('process-whatsapp-message', { conversationId: 'conv-1', messageId: 'msg-1' })
    );

    expect(mockRunToolLoop).not.toHaveBeenCalled();
    expect(mockSendJob).not.toHaveBeenCalled();
  });

  it('sends error reply when user has 0 businesses', async () => {
    mockFindConversationById.mockResolvedValue(makeConversation());
    mockFindUserById.mockResolvedValue(makeUser());
    mockFindBusinessesForUser.mockResolvedValue([]);
    const handler = makeHandler();

    await handler(
      makeJob('process-whatsapp-message', { conversationId: 'conv-1', messageId: 'msg-1' })
    );

    expect(mockRunToolLoop).not.toHaveBeenCalled();
    expect(mockSendJob).toHaveBeenCalledWith(
      mockBoss,
      'send-whatsapp-reply',
      expect.objectContaining({ body: expect.stringContaining('אין עסקים') }),
      expect.any(Object)
    );
  });

  it('calls LLM with null businessId when user has 2+ businesses', async () => {
    mockFindConversationById.mockResolvedValue(makeConversation());
    mockFindUserById.mockResolvedValue(makeUser());
    mockFindBusinessesForUser.mockResolvedValue([
      makeBusiness({ id: 'biz-1' }),
      makeBusiness({ id: 'biz-2', name: 'עסק שני' }),
    ]);
    mockFindRecentMessages.mockResolvedValue([]);
    mockRunToolLoop.mockResolvedValue('בחר עסק');
    mockInsertMessage.mockResolvedValue({});
    mockUpdateConversation.mockResolvedValue({});
    mockSendJob.mockResolvedValue('job-1');

    const handler = makeHandler();

    await handler(
      makeJob('process-whatsapp-message', { conversationId: 'conv-1', messageId: 'msg-1' })
    );

    // Tool loop called — context has null businessId
    expect(mockRunToolLoop).toHaveBeenCalledTimes(1);
    const callArgs = mockRunToolLoop.mock.calls[0]![0];
    expect(callArgs.context.businessId).toBeNull();
    expect(callArgs.context.userRole).toBeNull();
  });

  it('clears stale activeBusinessId when user removed from business', async () => {
    mockFindConversationById.mockResolvedValue(makeConversation({ activeBusinessId: 'biz-stale' }));
    mockFindUserById.mockResolvedValue(makeUser());
    mockFindUserBusiness.mockResolvedValue(null); // no longer a member
    mockFindBusinessesForUser.mockResolvedValue([makeBusiness({ id: 'biz-new' })]);
    mockFindRecentMessages.mockResolvedValue([]);
    mockRunToolLoop.mockResolvedValue('ok');
    mockInsertMessage.mockResolvedValue({});
    mockUpdateConversation.mockResolvedValue({});
    mockSendJob.mockResolvedValue('job-1');

    const handler = makeHandler();

    await handler(
      makeJob('process-whatsapp-message', { conversationId: 'conv-1', messageId: 'msg-1' })
    );

    // First call: clear stale business
    expect(mockUpdateConversation).toHaveBeenCalledWith('conv-1', { activeBusinessId: null });
    // Second call: auto-set to new business
    expect(mockUpdateConversation).toHaveBeenCalledWith('conv-1', { activeBusinessId: 'biz-new' });
  });

  it('throws on LLM 429 error for pg-boss retry', async () => {
    setupHappyPath();
    const apiError = new Anthropic.APIError(
      429,
      { type: 'error', error: { type: 'rate_limit_error', message: 'rate limited' } },
      'rate limited',
      new Headers()
    );
    mockRunToolLoop.mockRejectedValue(apiError);

    const handler = makeHandler();

    await expect(
      handler(makeJob('process-whatsapp-message', { conversationId: 'conv-1', messageId: 'msg-1' }))
    ).rejects.toThrow();
  });

  it('sends apology and does not throw on LLM 400 error', async () => {
    setupHappyPath();
    const apiError = new Anthropic.APIError(
      400,
      { type: 'error', error: { type: 'invalid_request_error', message: 'bad request' } },
      'bad request',
      new Headers()
    );
    mockRunToolLoop.mockRejectedValue(apiError);

    const handler = makeHandler();

    await handler(
      makeJob('process-whatsapp-message', { conversationId: 'conv-1', messageId: 'msg-1' })
    );

    expect(mockSendJob).toHaveBeenCalledWith(
      mockBoss,
      'send-whatsapp-reply',
      expect.objectContaining({ body: expect.stringContaining('משהו השתבש') }),
      expect.any(Object)
    );
  });

  it('sends apology on timeout (AbortError) without throwing', async () => {
    setupHappyPath();
    const abortError = new DOMException('aborted', 'AbortError');
    mockRunToolLoop.mockRejectedValue(abortError);

    const handler = makeHandler();

    await handler(
      makeJob('process-whatsapp-message', { conversationId: 'conv-1', messageId: 'msg-1' })
    );

    expect(mockSendJob).toHaveBeenCalledWith(
      mockBoss,
      'send-whatsapp-reply',
      expect.objectContaining({ body: expect.stringContaining('יותר מדי זמן') }),
      expect.any(Object)
    );
  });
});
