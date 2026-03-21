import type { ContentBlock } from '@anthropic-ai/sdk/resources/messages/messages.js';
import type { ClaudeClient, ClaudeResponse } from '../llm/claude-client.js';
import type { ClaudeMessage } from './context-builder.js';
import type { ToolContext, ToolRegistry } from './types.js';
import { executeTool, getToolDefinitions } from './types.js';

const MAX_ITERATIONS = 10;
const TIMEOUT_MESSAGE = 'מצטער, הבקשה לקחה יותר מדי זמן. נסו שוב.';
const MAX_ITERATIONS_MESSAGE = 'מצטער, לא הצלחתי לעבד את הבקשה. נסו שוב בפשטות.';

export interface ToolLoopParams {
  claudeClient: ClaudeClient;
  toolRegistry: ToolRegistry;
  systemPrompt: string;
  messages: ClaudeMessage[];
  context: ToolContext;
  storeMessage: (
    role: string,
    toolName: string | null,
    toolCallId: string | null,
    body: string
  ) => Promise<void>;
  abortSignal?: AbortSignal;
}

function extractTextReply(response: ClaudeResponse): string {
  return (
    response.content
      .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n') || ''
  );
}

function buildAssistantContent(response: ClaudeResponse): ClaudeMessage['content'] {
  const content: ClaudeMessage['content'] = [];
  for (const block of response.content) {
    if (block.type === 'text') {
      content.push({ type: 'text', text: block.text });
    } else if (block.type === 'tool_use') {
      content.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
    }
  }
  return content;
}

type ToolUseContentBlock = Extract<ContentBlock, { type: 'tool_use' }>;

async function executeToolCalls(
  toolUseBlocks: ToolUseContentBlock[],
  toolRegistry: ToolRegistry,
  context: ToolContext,
  storeMessage: ToolLoopParams['storeMessage']
): Promise<Array<{ type: 'tool_result'; tool_use_id: string; content: string }>> {
  const results: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];
  for (const block of toolUseBlocks) {
    const result = await executeTool(toolRegistry, block.name, block.input, context);
    await storeMessage('tool_result', block.name, block.id, result);
    results.push({ type: 'tool_result', tool_use_id: block.id, content: result });
  }
  return results;
}

export async function runToolLoop(params: ToolLoopParams): Promise<string> {
  const { claudeClient, toolRegistry, systemPrompt, messages, context, storeMessage, abortSignal } =
    params;

  const tools = getToolDefinitions(toolRegistry);
  const conversationMessages = [...messages];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (abortSignal?.aborted) {
      await storeMessage('assistant', null, null, TIMEOUT_MESSAGE);
      return TIMEOUT_MESSAGE;
    }

    const response = await sendWithAbortHandling(
      claudeClient,
      systemPrompt,
      conversationMessages,
      tools,
      abortSignal,
      storeMessage
    );
    if (!response) return TIMEOUT_MESSAGE;

    const toolUseBlocks = response.content.filter(
      (b): b is ToolUseContentBlock => b.type === 'tool_use'
    );

    if (toolUseBlocks.length === 0) {
      const text = extractTextReply(response);
      await storeMessage('assistant', null, null, text);
      return text;
    }

    // Store tool_call messages
    const assistantContent = buildAssistantContent(response);
    for (const block of toolUseBlocks) {
      await storeMessage('tool_call', block.name, block.id, JSON.stringify(block.input));
    }
    conversationMessages.push({ role: 'assistant', content: assistantContent });

    // Execute tools and store results
    const toolResults = await executeToolCalls(toolUseBlocks, toolRegistry, context, storeMessage);
    conversationMessages.push({ role: 'user', content: toolResults });
  }

  // Max iterations exceeded
  await storeMessage('assistant', null, null, MAX_ITERATIONS_MESSAGE);
  return MAX_ITERATIONS_MESSAGE;
}

async function sendWithAbortHandling(
  claudeClient: ClaudeClient,
  systemPrompt: string,
  messages: ClaudeMessage[],
  tools: ReturnType<typeof getToolDefinitions>,
  abortSignal: AbortSignal | undefined,
  storeMessage: ToolLoopParams['storeMessage']
): Promise<ClaudeResponse | null> {
  try {
    const sendParams: Parameters<ClaudeClient['sendMessage']>[0] = {
      system: systemPrompt,
      messages,
      tools,
    };
    if (abortSignal) {
      sendParams.signal = abortSignal;
    }
    return await claudeClient.sendMessage(sendParams);
  } catch (err: unknown) {
    if (isAbortError(err)) {
      await storeMessage('assistant', null, null, TIMEOUT_MESSAGE);
      return null;
    }
    throw err;
  }
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  return false;
}
