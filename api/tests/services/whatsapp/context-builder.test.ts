import { describe, expect, it, vi } from 'vitest';
import type { MessageRecord } from '../../../src/repositories/whatsapp-repository.js';
import {
  buildClaudeMessages,
  trimToTokenBudget,
  type ClaudeMessage,
} from '../../../src/services/whatsapp/context-builder.js';

function makeMessage(
  overrides: Partial<MessageRecord> & Pick<MessageRecord, 'llmRole' | 'body'>
): MessageRecord {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    twilioSid: null,
    direction: overrides.llmRole === 'user' ? 'inbound' : 'outbound',
    toolName: null,
    toolCallId: null,
    metadata: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('buildClaudeMessages', () => {
  it('returns empty array for empty input', () => {
    expect(buildClaudeMessages([])).toEqual([]);
  });

  it('maps simple user/assistant alternation', () => {
    const messages = [
      makeMessage({ llmRole: 'user', body: 'hello' }),
      makeMessage({ llmRole: 'assistant', body: 'hi there' }),
      makeMessage({ llmRole: 'user', body: 'thanks' }),
    ];

    const result = buildClaudeMessages(messages);

    expect(result).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
      { role: 'user', content: 'thanks' },
    ]);
  });

  it('groups consecutive tool_call rows into single assistant message', () => {
    const messages = [
      makeMessage({ llmRole: 'user', body: 'create invoice' }),
      makeMessage({
        llmRole: 'tool_call',
        body: '{"amount": 100}',
        toolName: 'create_invoice',
        toolCallId: 'tc-1',
      }),
      makeMessage({
        llmRole: 'tool_call',
        body: '{"id": "inv-1"}',
        toolName: 'add_line_item',
        toolCallId: 'tc-2',
      }),
    ];

    const result = buildClaudeMessages(messages);

    expect(result).toHaveLength(2);
    expect(result[1]!.role).toBe('assistant');
    expect(result[1]!.content).toEqual([
      { type: 'tool_use', id: 'tc-1', name: 'create_invoice', input: { amount: 100 } },
      { type: 'tool_use', id: 'tc-2', name: 'add_line_item', input: { id: 'inv-1' } },
    ]);
  });

  it('groups consecutive tool_result rows into single user message', () => {
    const messages = [
      makeMessage({
        llmRole: 'tool_call',
        body: '{}',
        toolName: 'tool_a',
        toolCallId: 'tc-1',
      }),
      makeMessage({
        llmRole: 'tool_result',
        body: 'result A',
        toolName: 'tool_a',
        toolCallId: 'tc-1',
      }),
      makeMessage({
        llmRole: 'tool_result',
        body: 'result B',
        toolName: 'tool_b',
        toolCallId: 'tc-2',
      }),
    ];

    const result = buildClaudeMessages(messages);

    expect(result).toHaveLength(2);
    expect(result[1]!.role).toBe('user');
    expect(result[1]!.content).toEqual([
      { type: 'tool_result', tool_use_id: 'tc-1', content: 'result A' },
      { type: 'tool_result', tool_use_id: 'tc-2', content: 'result B' },
    ]);
  });

  it('pairs tool_call and tool_result correctly', () => {
    const messages = [
      makeMessage({ llmRole: 'user', body: 'do something' }),
      makeMessage({
        llmRole: 'tool_call',
        body: '{"x": 1}',
        toolName: 'my_tool',
        toolCallId: 'tc-1',
      }),
      makeMessage({
        llmRole: 'tool_result',
        body: 'done',
        toolName: 'my_tool',
        toolCallId: 'tc-1',
      }),
      makeMessage({ llmRole: 'assistant', body: 'all done!' }),
    ];

    const result = buildClaudeMessages(messages);

    expect(result).toEqual([
      { role: 'user', content: 'do something' },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tc-1', name: 'my_tool', input: { x: 1 } }],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tc-1', content: 'done' }],
      },
      { role: 'assistant', content: 'all done!' },
    ]);
  });

  it('merges adjacent same-role messages (tool_result + user text)', () => {
    const messages = [
      makeMessage({
        llmRole: 'tool_call',
        body: '{}',
        toolName: 'check',
        toolCallId: 'tc-1',
      }),
      makeMessage({
        llmRole: 'tool_result',
        body: 'checked',
        toolName: 'check',
        toolCallId: 'tc-1',
      }),
      makeMessage({ llmRole: 'user', body: 'ok what next?' }),
    ];

    const result = buildClaudeMessages(messages);

    expect(result).toHaveLength(2);
    // tool_result (role: user) + user text (role: user) → merged
    expect(result[1]!.role).toBe('user');
    expect(result[1]!.content).toEqual([
      { type: 'tool_result', tool_use_id: 'tc-1', content: 'checked' },
      { type: 'text', text: 'ok what next?' },
    ]);
  });

  it('handles invalid JSON in tool_call body gracefully', () => {
    const messages = [
      makeMessage({
        llmRole: 'tool_call',
        body: 'not valid json {{{',
        toolName: 'broken_tool',
        toolCallId: 'tc-1',
      }),
    ];

    const result = buildClaudeMessages(messages);

    expect(result).toHaveLength(1);
    const content = result[0]!.content as Array<{ type: string; input: unknown }>;
    expect(content[0]!.input).toEqual({ raw: 'not valid json {{{' });
  });
});

describe('trimToTokenBudget', () => {
  it('returns all messages when under budget', () => {
    const messages: ClaudeMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];

    const result = trimToTokenBudget(messages, 1000);
    expect(result).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(trimToTokenBudget([], 100)).toEqual([]);
  });

  it('drops oldest messages first', () => {
    const messages: ClaudeMessage[] = [
      { role: 'user', content: 'A'.repeat(100) }, // 50 tokens
      { role: 'assistant', content: 'B'.repeat(100) }, // 50 tokens
      { role: 'user', content: 'C'.repeat(100) }, // 50 tokens
    ];

    // Budget for ~2 messages (100 tokens), 3 messages = 150 tokens
    const result = trimToTokenBudget(messages, 100);
    expect(result).toHaveLength(2);
    expect((result[0]!.content as string)[0]).toBe('B');
    expect((result[1]!.content as string)[0]).toBe('C');
  });

  it('uses chars/2 heuristic (conservative for Hebrew)', () => {
    // Hebrew: "שלום" = 4 chars → 2 tokens with chars/2 heuristic
    const messages: ClaudeMessage[] = [{ role: 'user', content: 'שלום' }];

    // 4 chars → ceil(4/2) = 2 tokens; budget of 2 should keep it
    const result = trimToTokenBudget(messages, 2);
    expect(result).toHaveLength(1);

    // Budget of 1 should drop it
    const result2 = trimToTokenBudget(messages, 1);
    expect(result2).toHaveLength(0);
  });

  it('never breaks tool_call/tool_result pairs', () => {
    const messages: ClaudeMessage[] = [
      { role: 'user', content: 'A'.repeat(200) }, // 100 tokens
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tc-1', name: 'tool', input: {} }],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tc-1', content: 'result' }],
      },
      { role: 'assistant', content: 'done' },
    ];

    // Tight budget — should drop the first user message but keep the tool pair together
    const result = trimToTokenBudget(messages, 50);

    // Verify tool_use and tool_result are both present or both absent
    const hasToolUse = result.some(
      (m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_use')
    );
    const hasToolResult = result.some(
      (m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result')
    );
    expect(hasToolUse).toBe(hasToolResult);
  });

  it('logs warning when trimming occurs', () => {
    const messages: ClaudeMessage[] = [
      { role: 'user', content: 'A'.repeat(200) },
      { role: 'assistant', content: 'B'.repeat(200) },
    ];

    const warn = { warn: vi.fn() };
    trimToTokenBudget(messages, 50, warn);

    expect(warn.warn).toHaveBeenCalledWith(
      expect.objectContaining({ trimCount: expect.any(Number), maxTokens: 50 }),
      'context trimmed to budget'
    );
  });
});
