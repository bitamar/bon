import Anthropic from '@anthropic-ai/sdk';
import type { FastifyBaseLogger } from 'fastify';
import type { ToolDefinition } from '../whatsapp/types.js';
import type { ClaudeMessage } from '../whatsapp/context-builder.js';

export interface ClaudeClientOptions {
  apiKey: string;
  model: string;
  maxTokens: number;
}

export type ClaudeResponse = Anthropic.Message;

export interface ClaudeClient {
  sendMessage(params: {
    system: string;
    messages: ClaudeMessage[];
    tools: ToolDefinition[];
    signal?: AbortSignal;
  }): Promise<ClaudeResponse>;
}

export function createClaudeClient(
  options: ClaudeClientOptions,
  logger: FastifyBaseLogger
): ClaudeClient {
  const client = new Anthropic({ apiKey: options.apiKey });

  return {
    async sendMessage({ system, messages, tools, signal }) {
      try {
        const params: Anthropic.MessageCreateParamsNonStreaming = {
          model: options.model,
          max_tokens: options.maxTokens,
          system,
          messages: messages as Anthropic.MessageParam[],
        };
        if (tools.length > 0) {
          params.tools = tools as Anthropic.Tool[];
        }
        const requestOptions: Anthropic.RequestOptions = {};
        if (signal) {
          requestOptions.signal = signal;
        }
        return await client.messages.create(params, requestOptions);
      } catch (err: unknown) {
        if (err instanceof Anthropic.APIError) {
          logger.error({ status: err.status, message: err.message }, 'Claude API error');
        }
        throw err;
      }
    },
  };
}
