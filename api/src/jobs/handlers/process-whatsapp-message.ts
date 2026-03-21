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

const RETRYABLE_STATUSES = new Set([429, 500, 529]);

interface ResolvedBusiness {
  businessId: string | null;
  businessName: string | null;
  userRole: string | null;
}

async function resolveBusiness(
  userId: string,
  conversationId: string,
  activeBusinessId: string | null,
  logger: FastifyBaseLogger
): Promise<ResolvedBusiness | 'no_businesses'> {
  let businessId = activeBusinessId;

  if (businessId) {
    const membership = await findUserBusiness(userId, businessId);
    if (membership) {
      const businesses = await findBusinessesForUser(userId);
      const biz = businesses.find((b) => b.id === businessId);
      return {
        businessId,
        businessName: biz?.name ?? null,
        userRole: biz?.role ?? membership.role,
      };
    }
    logger.info({ conversationId, businessId }, 'stale business membership, clearing');
    await updateConversation(conversationId, { activeBusinessId: null });
    businessId = null;
  }

  const businesses = await findBusinessesForUser(userId);
  if (businesses.length === 0) {
    return 'no_businesses';
  }
  if (businesses.length === 1) {
    const biz = businesses[0]!;
    await updateConversation(conversationId, { activeBusinessId: biz.id });
    return { businessId: biz.id, businessName: biz.name, userRole: biz.role };
  }
  // > 1: businessId stays null, system prompt tells LLM to use select_business
  return { businessId: null, businessName: null, userRole: null };
}

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

    const resolved = await resolveBusiness(
      conversation.userId,
      conversationId,
      conversation.activeBusinessId,
      logger
    );
    if (resolved === 'no_businesses') {
      await enqueueReply(boss, conversationId, conversation.phone, NO_BUSINESS_MESSAGE);
      return;
    }

    const { businessId, businessName, userRole } = resolved;

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
      await handleToolLoopError(err, conversationId, conversation.phone, logger, boss);
    } finally {
      clearTimeout(timeout);
    }
  };
}

async function handleToolLoopError(
  err: unknown,
  conversationId: string,
  phone: string,
  logger: FastifyBaseLogger,
  boss: PgBoss
): Promise<void> {
  if (isAbortError(err)) {
    logger.warn({ conversationId }, 'process-whatsapp-message: timeout');
    await enqueueReply(boss, conversationId, phone, TIMEOUT_APOLOGY);
    return;
  }

  if (err instanceof Anthropic.APIError) {
    if (RETRYABLE_STATUSES.has(err.status)) {
      throw err;
    }
    logger.error({ status: err.status, message: err.message }, 'Claude API non-retryable error');
    await enqueueReply(boss, conversationId, phone, APOLOGY_MESSAGE);
    return;
  }

  logger.error({ err }, 'process-whatsapp-message: unexpected error');
  throw err;
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
