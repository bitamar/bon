import type { FastifyBaseLogger } from 'fastify';
import type { MessageRecord } from '../../repositories/whatsapp-repository.js';

// ── Claude API message types ──

interface TextContent {
  type: 'text';
  text: string;
}

interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

type ContentBlock = TextContent | ToolUseContent | ToolResultContent;

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

/**
 * Maps DB message rows (in chronological order) to Claude API message format.
 *
 * Handles:
 * - Consecutive tool_call rows → single assistant message with multiple tool_use blocks
 * - Consecutive tool_result rows → single user message with multiple tool_result blocks
 * - Adjacent same-role merging (e.g. tool_result + user text)
 */
export function buildClaudeMessages(messages: MessageRecord[]): ClaudeMessage[] {
  const result: ClaudeMessage[] = [];

  for (const msg of messages) {
    const block = toContentBlock(msg);
    const role = msg.llmRole === 'assistant' || msg.llmRole === 'tool_call' ? 'assistant' : 'user';

    const last = result[result.length - 1];
    if (last && last.role === role) {
      // Merge into previous message
      last.content = ensureArray(last.content);
      last.content.push(block);
    } else {
      result.push({ role, content: [block] });
    }
  }

  // Simplify single-text messages to string form
  for (const msg of result) {
    if (Array.isArray(msg.content) && msg.content.length === 1 && msg.content[0]!.type === 'text') {
      msg.content = (msg.content[0] as TextContent).text;
    }
  }

  return result;
}

function toContentBlock(msg: MessageRecord): ContentBlock {
  switch (msg.llmRole) {
    case 'user':
      return { type: 'text', text: msg.body };
    case 'assistant':
      return { type: 'text', text: msg.body };
    case 'tool_call':
      return {
        type: 'tool_use',
        id: msg.toolCallId ?? '',
        name: msg.toolName ?? '',
        input: safeJsonParse(msg.body),
      };
    case 'tool_result':
      return {
        type: 'tool_result',
        tool_use_id: msg.toolCallId ?? '',
        content: msg.body,
      };
  }
}

function safeJsonParse(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return { raw: body };
  }
}

function ensureArray(content: string | ContentBlock[]): ContentBlock[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  return content;
}

/**
 * Trims messages to fit within a token budget.
 * Drops oldest messages first, never breaks tool_call/tool_result pairs.
 * Uses chars/2 heuristic (conservative for Hebrew which tokenizes at ~2 chars/token).
 */
export function trimToTokenBudget(
  messages: ClaudeMessage[],
  maxTokens: number,
  logger?: Pick<FastifyBaseLogger, 'warn'>
): ClaudeMessage[] {
  if (messages.length === 0) return [];

  let trimmed = [...messages];
  let trimCount = 0;

  while (trimmed.length > 0 && estimateTokens(trimmed) > maxTokens) {
    // Find the first droppable message (skip tool_result at index 0 that pairs with a prior tool_call)
    const dropIndex = findDroppableIndex(trimmed);
    if (dropIndex < 0) break;
    trimmed.splice(dropIndex, 1);
    trimCount++;
  }

  if (trimCount > 0) {
    logger?.warn({ trimCount, remaining: trimmed.length, maxTokens }, 'context trimmed to budget');
  }

  return trimmed;
}

function estimateTokens(messages: ClaudeMessage[]): number {
  let chars = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      chars += msg.content.length;
    } else {
      for (const block of msg.content) {
        if (block.type === 'text') chars += block.text.length;
        else if (block.type === 'tool_use') chars += JSON.stringify(block.input).length;
        else if (block.type === 'tool_result') chars += block.content.length;
      }
    }
  }
  return Math.ceil(chars / 2);
}

/**
 * Finds the index of the oldest droppable message.
 * A message is not droppable if removing it would break a tool_call/tool_result pair:
 * - An assistant message with tool_use blocks must be dropped together with its following tool_result user message
 * - A user message with tool_result blocks that follows an assistant tool_use message is part of a pair
 */
function findDroppableIndex(messages: ClaudeMessage[]): number {
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;

    // If this is an assistant message with tool_use, check if next is its tool_result pair
    if (hasToolUse(msg)) {
      const next = messages[i + 1];
      if (next && hasToolResult(next)) {
        // Drop both as a pair
        messages.splice(i + 1, 1); // remove the tool_result first (higher index)
        return i; // then caller removes this one
      }
      return i;
    }

    // If this is a tool_result user message, it should have been paired above.
    // Skip it — don't drop a tool_result without its tool_call.
    if (hasToolResult(msg)) {
      continue;
    }

    return i;
  }
  return -1;
}

function hasToolUse(msg: ClaudeMessage): boolean {
  return Array.isArray(msg.content) && msg.content.some((b) => b.type === 'tool_use');
}

function hasToolResult(msg: ClaudeMessage): boolean {
  return Array.isArray(msg.content) && msg.content.some((b) => b.type === 'tool_result');
}
