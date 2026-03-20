import { z } from 'zod';
import { isoDateTime, nonEmptyString, nullableString, uuidSchema } from './common.js';

// ── Enums ──

export const CONVERSATION_STATUSES = ['active', 'idle', 'blocked'] as const;
export const conversationStatusSchema = z.enum(CONVERSATION_STATUSES);
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;

export const MESSAGE_DIRECTIONS = ['inbound', 'outbound'] as const;
export const messageDirectionSchema = z.enum(MESSAGE_DIRECTIONS);
export type MessageDirection = z.infer<typeof messageDirectionSchema>;

export const LLM_ROLES = ['user', 'assistant', 'tool_call', 'tool_result'] as const;
export const llmRoleSchema = z.enum(LLM_ROLES);
export type LlmRole = z.infer<typeof llmRoleSchema>;

// ── E.164 phone validation ──

export const e164PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/, 'Must be E.164 format (e.g. +972521234567)');

// ── Conversation ──

export const whatsappConversationSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  phone: e164PhoneSchema,
  activeBusinessId: z.union([uuidSchema, z.literal(null)]),
  status: conversationStatusSchema,
  lastActivityAt: isoDateTime,
  createdAt: isoDateTime,
});

export type WhatsappConversation = z.infer<typeof whatsappConversationSchema>;

// ── Message ──

export const whatsappMessageSchema = z.object({
  id: uuidSchema,
  conversationId: uuidSchema,
  twilioSid: nullableString,
  direction: messageDirectionSchema,
  llmRole: llmRoleSchema,
  toolName: nullableString,
  toolCallId: nullableString,
  body: nonEmptyString,
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: isoDateTime,
});

export type WhatsappMessage = z.infer<typeof whatsappMessageSchema>;

// ── Pending Action (confirmation guard) ──

export const whatsappPendingActionSchema = z.object({
  id: uuidSchema,
  conversationId: uuidSchema,
  actionType: nonEmptyString,
  payload: z.record(z.string(), z.unknown()),
  expiresAt: isoDateTime,
  createdAt: isoDateTime,
});

export type WhatsappPendingAction = z.infer<typeof whatsappPendingActionSchema>;

// ── Tool Registry types ──

export const toolDefinitionSchema = z.object({
  name: nonEmptyString,
  description: nonEmptyString,
  input_schema: z.record(z.string(), z.unknown()),
});

export type ToolDefinition = z.infer<typeof toolDefinitionSchema>;

// ── Inbound webhook payload (from Twilio) ──

export const twilioInboundSchema = z.object({
  MessageSid: nonEmptyString,
  From: nonEmptyString,
  Body: nonEmptyString,
  NumMedia: z.coerce.number().int().nonnegative().default(0),
});

export type TwilioInbound = z.infer<typeof twilioInboundSchema>;
