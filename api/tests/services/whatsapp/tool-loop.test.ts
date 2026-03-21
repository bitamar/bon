import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runToolLoop } from '../../../src/services/whatsapp/tool-loop.js';
import type { ToolLoopParams } from '../../../src/services/whatsapp/tool-loop.js';
import type { ClaudeClient, ClaudeResponse } from '../../../src/services/llm/claude-client.js';
import type { ToolContext, ToolRegistry } from '../../../src/services/whatsapp/types.js';
import { createToolRegistry, registerTool } from '../../../src/services/whatsapp/types.js';
import { makeLogger } from '../../utils/jobs.js';

// ── helpers (module scope per S2004) ──

function makeClaudeClient(responses: ClaudeResponse[]): ClaudeClient {
  let callIndex = 0;
  return {
    sendMessage: vi.fn().mockImplementation(() => {
      const response = responses[callIndex++];
      if (!response) throw new Error('no more mock responses');
      return Promise.resolve(response);
    }),
  };
}

function textResponse(text: string): ClaudeResponse {
  return {
    id: 'msg-1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 10,
      output_tokens: 10,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    content: [{ type: 'text', text }],
  } as ClaudeResponse;
}

function toolUseResponse(
  toolCalls: Array<{ id: string; name: string; input: unknown }>
): ClaudeResponse {
  return {
    id: 'msg-1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: {
      input_tokens: 10,
      output_tokens: 10,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    content: toolCalls.map((tc) => ({
      type: 'tool_use' as const,
      id: tc.id,
      name: tc.name,
      input: tc.input,
    })),
  } as ClaudeResponse;
}

function makeContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: 'user-1',
    businessId: 'biz-1',
    userRole: 'owner',
    conversationId: 'conv-1',
    logger: makeLogger(),
    ...overrides,
  };
}

function makeRegistryWithTool(name: string, result: string): ToolRegistry {
  const registry = createToolRegistry();
  registerTool(
    registry,
    {
      name,
      description: `Tool ${name}`,
      input_schema: { type: 'object', properties: {}, required: [] },
    },
    vi.fn().mockResolvedValue(result)
  );
  return registry;
}

function makeLoopParams(overrides: Partial<ToolLoopParams>): ToolLoopParams {
  return {
    claudeClient: overrides.claudeClient ?? makeClaudeClient([textResponse('hi')]),
    toolRegistry: overrides.toolRegistry ?? createToolRegistry(),
    systemPrompt: 'test prompt',
    messages: [{ role: 'user', content: 'hello' }],
    context: overrides.context ?? makeContext(),
    storeMessage: overrides.storeMessage ?? vi.fn(),
    abortSignal: overrides.abortSignal,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('runToolLoop', () => {
  it('returns text for text-only response', async () => {
    const storeMessage = vi.fn();
    const result = await runToolLoop(
      makeLoopParams({
        claudeClient: makeClaudeClient([textResponse('שלום!')]),
        storeMessage,
      })
    );

    expect(result).toBe('שלום!');
    expect(storeMessage).toHaveBeenCalledWith('assistant', null, null, 'שלום!');
  });

  it('executes a single tool call and returns final text', async () => {
    const registry = makeRegistryWithTool('test_tool', 'tool-result');
    const storeMessage = vi.fn();

    const result = await runToolLoop(
      makeLoopParams({
        claudeClient: makeClaudeClient([
          toolUseResponse([{ id: 'call-1', name: 'test_tool', input: { q: 'a' } }]),
          textResponse('got it'),
        ]),
        toolRegistry: registry,
        storeMessage,
      })
    );

    expect(result).toBe('got it');
    expect(storeMessage).toHaveBeenCalledWith(
      'tool_call',
      'test_tool',
      'call-1',
      JSON.stringify({ q: 'a' })
    );
    expect(storeMessage).toHaveBeenCalledWith('tool_result', 'test_tool', 'call-1', 'tool-result');
    expect(storeMessage).toHaveBeenCalledWith('assistant', null, null, 'got it');
  });

  it('handles multi-tool call (2 tools in one response)', async () => {
    const registry = createToolRegistry();
    registerTool(
      registry,
      {
        name: 'tool_a',
        description: 'A',
        input_schema: { type: 'object', properties: {}, required: [] },
      },
      vi.fn().mockResolvedValue('result-a')
    );
    registerTool(
      registry,
      {
        name: 'tool_b',
        description: 'B',
        input_schema: { type: 'object', properties: {}, required: [] },
      },
      vi.fn().mockResolvedValue('result-b')
    );
    const storeMessage = vi.fn();

    const result = await runToolLoop(
      makeLoopParams({
        claudeClient: makeClaudeClient([
          toolUseResponse([
            { id: 'call-a', name: 'tool_a', input: {} },
            { id: 'call-b', name: 'tool_b', input: {} },
          ]),
          textResponse('both done'),
        ]),
        toolRegistry: registry,
        storeMessage,
      })
    );

    expect(result).toBe('both done');
    // 2 tool_call + 2 tool_result + 1 assistant = 5 storeMessage calls
    expect(storeMessage).toHaveBeenCalledTimes(5);
  });

  it('handles multi-turn (tool → text → tool → text)', async () => {
    const registry = makeRegistryWithTool('my_tool', 'tool-out');
    const storeMessage = vi.fn();

    const result = await runToolLoop(
      makeLoopParams({
        claudeClient: makeClaudeClient([
          toolUseResponse([{ id: 'c1', name: 'my_tool', input: {} }]),
          toolUseResponse([{ id: 'c2', name: 'my_tool', input: { x: 1 } }]),
          textResponse('final answer'),
        ]),
        toolRegistry: registry,
        storeMessage,
      })
    );

    expect(result).toBe('final answer');
    // 2 tool_call + 2 tool_result + 1 final assistant
    expect(storeMessage).toHaveBeenCalledTimes(5);
  });

  it('returns error string to Claude when tool execution fails', async () => {
    const registry = createToolRegistry();
    registerTool(
      registry,
      {
        name: 'bad_tool',
        description: 'Bad',
        input_schema: { type: 'object', properties: {}, required: [] },
      },
      vi.fn().mockRejectedValue(new Error('db error'))
    );
    const storeMessage = vi.fn();
    const claudeClient = makeClaudeClient([
      toolUseResponse([{ id: 'c1', name: 'bad_tool', input: {} }]),
      textResponse('sorry about that'),
    ]);

    const result = await runToolLoop(
      makeLoopParams({
        claudeClient,
        toolRegistry: registry,
        storeMessage,
      })
    );

    expect(result).toBe('sorry about that');
    // tool_result should contain error string (not throw)
    expect(storeMessage).toHaveBeenCalledWith(
      'tool_result',
      'bad_tool',
      'c1',
      expect.stringContaining('שגיאה')
    );
  });

  it('returns error message when max iterations exceeded', async () => {
    const registry = makeRegistryWithTool('loop_tool', 'again');
    const storeMessage = vi.fn();
    // Create 11 tool_use responses (exceeds max of 10)
    const responses = Array.from({ length: 11 }, (_, i) =>
      toolUseResponse([{ id: `c${i}`, name: 'loop_tool', input: {} }])
    );

    const result = await runToolLoop(
      makeLoopParams({
        claudeClient: makeClaudeClient(responses),
        toolRegistry: registry,
        storeMessage,
      })
    );

    expect(result).toContain('לא הצלחתי לעבד');
  });

  it('returns timeout message when abort signal is triggered', async () => {
    const storeMessage = vi.fn();
    const abortController = new AbortController();
    abortController.abort();

    const result = await runToolLoop(
      makeLoopParams({
        storeMessage,
        abortSignal: abortController.signal,
      })
    );

    expect(result).toContain('יותר מדי זמן');
    expect(storeMessage).toHaveBeenCalledWith(
      'assistant',
      null,
      null,
      expect.stringContaining('זמן')
    );
  });

  it('returns timeout message when Claude API throws AbortError', async () => {
    const storeMessage = vi.fn();
    const abortError = new DOMException('aborted', 'AbortError');
    const claudeClient: ClaudeClient = {
      sendMessage: vi.fn().mockRejectedValue(abortError),
    };

    const result = await runToolLoop(
      makeLoopParams({
        claudeClient,
        storeMessage,
      })
    );

    expect(result).toContain('יותר מדי זמן');
  });
});
