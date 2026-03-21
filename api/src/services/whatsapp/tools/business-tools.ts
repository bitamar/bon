import { z } from 'zod';
import {
  findBusinessesForUser,
  findUserBusiness,
} from '../../../repositories/user-business-repository.js';
import { updateConversation } from '../../../repositories/whatsapp-repository.js';
import type { ToolContext, ToolDefinition, ToolHandler, ToolRegistry } from '../types.js';
import { registerTool } from '../types.js';

// ── Definitions ──

const listBusinessesDefinition: ToolDefinition = {
  name: 'list_businesses',
  description: 'הצג רשימת העסקים שלי',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

const selectBusinessDefinition: ToolDefinition = {
  name: 'select_business',
  description: 'בחר עסק פעיל (כשהמשתמש שייך ליותר מעסק אחד)',
  input_schema: {
    type: 'object',
    properties: {
      businessId: { type: 'string', description: 'מזהה העסק' },
    },
    required: ['businessId'],
  },
};

// ── Role display names ──

const ROLE_DISPLAY: Record<string, string> = {
  owner: 'בעלים',
  admin: 'מנהל',
  user: 'משתמש',
};

function displayRole(role: string): string {
  return ROLE_DISPLAY[role] ?? role;
}

// ── Handlers ──

const listBusinessesHandler: ToolHandler = async (_input: unknown, context: ToolContext) => {
  const businesses = await findBusinessesForUser(context.userId);
  if (businesses.length === 0) {
    return 'אין עסקים מחוברים לחשבון שלך.';
  }
  return businesses.map((b, i) => `${i + 1}. ${b.name} (${displayRole(b.role)})`).join('\n');
};

const selectBusinessInputSchema = z.object({ businessId: z.string() });

const selectBusinessHandler: ToolHandler = async (input: unknown, context: ToolContext) => {
  const parsed = selectBusinessInputSchema.safeParse(input);
  if (!parsed.success) {
    return 'שגיאה: נדרש מזהה עסק (businessId).';
  }
  const { businessId } = parsed.data;

  const membership = await findUserBusiness(context.userId, businessId);
  if (!membership) {
    return 'אין לך גישה לעסק זה.';
  }

  const businesses = await findBusinessesForUser(context.userId);
  const business = businesses.find((b) => b.id === businessId);
  const businessName = business?.name ?? businessId;
  const role = business?.role ?? membership.role;

  await updateConversation(context.conversationId, { activeBusinessId: businessId });

  return `עסק פעיל: ${businessName} (תפקיד: ${displayRole(role)})`;
};

// ── Registration ──

export function registerBusinessTools(registry: ToolRegistry): void {
  registerTool(registry, listBusinessesDefinition, listBusinessesHandler);
  registerTool(registry, selectBusinessDefinition, selectBusinessHandler);
}
