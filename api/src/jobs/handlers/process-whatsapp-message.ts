import Anthropic from '@anthropic-ai/sdk';
import type { FastifyBaseLogger } from 'fastify';
import type { Job, PgBoss } from 'pg-boss';
import type { JobPayloads } from '../boss.js';
import { sendJob } from '../boss.js';
import { findUserById } from '../../repositories/user-repository.js';
import {
  findBusinessesForUser,
  findUserBusiness,
} from '../../repositories/user-business-repository.js';
import {
  findConversationById,
  findRecentMessages,
  insertMessage,
  updateConversation,
} from '../../repositories/whatsapp-repository.js';
import type { ClaudeClient } from '../../services/llm/claude-client.js';
import { buildClaudeMessages, trimToTokenBudget } from '../../services/whatsapp/context-builder.js';
import { buildSystemPrompt } from '../../services/whatsapp/system-prompt.js';
import { runToolLoop } from '../../services/whatsapp/tool-loop.js';
import type { ToolContext, ToolRegistry } from '../../services/whatsapp/types.js';

const TIMEOUT_MS = 60_000;
const APOLOGY_MESSAGE = 'מצטער, משהו השתבש. נסו שוב מאוחר יותר.';
const TIMEOUT_APOLOGY = 'מצטער, הבקשה לקחה יותר מדי זמן. נסו שוב.';
const NO_BUSINESS_MESSAGE = 'אין עסקים מחוברים לחשבון שלך. צרו עסק באפליקציה.';

export function createProcessWhatsAppMessageHandler(
  logger: FastifyBaseLogger,
  boss: PgBoss,
  claudeClient: ClaudeClient,
  toolRegistry: ToolRegistry
): (job: Job<JobPayloads['process-whatsapp-message']>) => Promise<void> {
  return async (job) => {
    const { conversationId, messageId } = job.data;

    const conversation = await findConversationById(conversationId);
    if (!conversation) {
      logger.warn(
        { conversationId, messageId },
        'process-whatsapp-message: conversation not found'
      );
      return;
    }

    const user = await findUserById(conversation.userId);
    if (!user) {
      logger.warn({ userId: conversation.userId }, 'process-whatsapp-message: user not found');
      return;
    }

    // Business resolution
    let businessId: string | null = conversation.activeBusinessId;
    let businessName: string | null = null;
    let userRole: string | null = null;

    if (businessId) {
      // Stale business guard: verify membership
      const membership = await findUserBusiness(conversation.userId, businessId);
      if (!membership) {
        logger.info({ conversationId, businessId }, 'stale business membership, clearing');
        await updateConversation(conversationId, { activeBusinessId: null });
        businessId = null;
      } else {
        const businesses = await findBusinessesForUser(conversation.userId);
        const biz = businesses.find((b) => b.id === businessId);
        businessName = biz?.name ?? null;
        userRole = biz?.role ?? membership.role;
      }
    }

    if (!businessId) {
      const businesses = await findBusinessesForUser(conversation.userId);
      if (businesses.length === 0) {
        await enqueueReply(boss, conversationId, conversation.phone, NO_BUSINESS_MESSAGE);
        return;
      }
      if (businesses.length === 1) {
        const biz = businesses[0]!;
        businessId = biz.id;
        businessName = biz.name;
        userRole = biz.role;
        await updateConversation(conversationId, { activeBusinessId: businessId });
      }
      // If > 1: businessId stays null, system prompt tells LLM to use select_business
    }

    // Load and build message context
    const recentMessages = await findRecentMessages(conversationId, 40);
    const chronological = [...recentMessages].reverse();
    const claudeMessages = buildClaudeMessages(chronological);
    const trimmedMessages = trimToTokenBudget(claudeMessages, 100_000, logger);

    const systemPrompt = buildSystemPrompt({
      userName: user.name ?? 'משתמש',
      businessName,
      userRole,
      date: new Date().toISOString().split('T')[0]!,
    });

    const toolContext: ToolContext = {
      userId: conversation.userId,
      businessId,
      userRole: userRole as ToolContext['userRole'],
      conversationId,
      logger,
      boss,
    };

    const storeMessage = async (
      role: string,
      toolName: string | null,
      toolCallId: string | null,
      body: string
    ): Promise<void> => {
      await insertMessage({
        conversationId,
        direction: 'outbound',
        llmRole: role as 'assistant' | 'tool_call' | 'tool_result',
        toolName,
        toolCallId,
        body,
      });
    };

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), TIMEOUT_MS);

    try {
      const replyText = await runToolLoop({
        claudeClient,
        toolRegistry,
        systemPrompt,
        messages: trimmedMessages,
        context: toolContext,
        storeMessage,
        abortSignal: abortController.signal,
      });

      await updateConversation(conversationId, { lastActivityAt: new Date() });
      await enqueueReply(boss, conversationId, conversation.phone, replyText);
    } catch (err: unknown) {
      if (isAbortError(err)) {
        logger.warn({ conversationId }, 'process-whatsapp-message: timeout');
        await enqueueReply(boss, conversationId, conversation.phone, TIMEOUT_APOLOGY);
        return;
      }

      if (err instanceof Anthropic.APIError) {
        const status = err.status;
        if (status === 429 || status === 500 || status === 529) {
          // Transient — let pg-boss retry
          throw err;
        }
        // 400/401 — config error, no retry
        logger.error({ status, message: err.message }, 'Claude API non-retryable error');
        await enqueueReply(boss, conversationId, conversation.phone, APOLOGY_MESSAGE);
        return;
      }

      // Unknown error — retry
      logger.error({ err }, 'process-whatsapp-message: unexpected error');
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  };
}

async function enqueueReply(
  boss: PgBoss,
  conversationId: string,
  to: string,
  body: string
): Promise<void> {
  await sendJob(
    boss,
    'send-whatsapp-reply',
    { conversationId, body, to },
    { retryLimit: 5, retryDelay: 10, retryBackoff: true }
  );
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  return false;
}
