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

    let response: ClaudeResponse;
    try {
      const sendParams: Parameters<ClaudeClient['sendMessage']>[0] = {
        system: systemPrompt,
        messages: conversationMessages,
        tools,
      };
      if (abortSignal) {
        sendParams.signal = abortSignal;
      }
      response = await claudeClient.sendMessage(sendParams);
    } catch (err: unknown) {
      if (isAbortError(err)) {
        await storeMessage('assistant', null, null, TIMEOUT_MESSAGE);
        return TIMEOUT_MESSAGE;
      }
      throw err;
    }

    // Extract text and tool_use blocks from the response
    const textBlocks = response.content.filter((b) => b.type === 'text');
    const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');

    if (toolUseBlocks.length === 0) {
      // Text-only response — done
      const text = textBlocks.map((b) => b.text).join('\n') || '';
      await storeMessage('assistant', null, null, text);
      return text;
    }

    // Store tool_call messages and build assistant content block
    const assistantContent: ClaudeMessage['content'] = [];
    for (const block of response.content) {
      if (block.type === 'text') {
        assistantContent.push({ type: 'text', text: block.text });
      } else if (block.type === 'tool_use') {
        assistantContent.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input,
        });
        await storeMessage('tool_call', block.name, block.id, JSON.stringify(block.input));
      }
    }
    conversationMessages.push({ role: 'assistant', content: assistantContent });

    // Execute tools and store results
    const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];
    for (const block of toolUseBlocks) {
      const result = await executeTool(toolRegistry, block.name, block.input, context);
      await storeMessage('tool_result', block.name, block.id, result);
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
    }
    conversationMessages.push({ role: 'user', content: toolResults });
  }

  // Max iterations exceeded
  await storeMessage('assistant', null, null, MAX_ITERATIONS_MESSAGE);
  return MAX_ITERATIONS_MESSAGE;
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  return false;
}
