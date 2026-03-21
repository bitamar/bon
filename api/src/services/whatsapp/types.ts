import type { FastifyBaseLogger } from 'fastify';
import type { PgBoss } from 'pg-boss';
import type { BusinessRole } from '@bon/types/businesses';
import type { ToolDefinition } from '@bon/types/whatsapp';

export type { ToolDefinition } from '@bon/types/whatsapp';

export interface ToolContext {
  userId: string;
  businessId: string | null;
  userRole: BusinessRole | null;
  conversationId: string;
  logger: FastifyBaseLogger;
  boss?: PgBoss;
}

export type ToolHandler = (input: unknown, context: ToolContext) => Promise<string>;

export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export type ToolRegistry = Map<string, RegisteredTool>;

export function createToolRegistry(): ToolRegistry {
  return new Map();
}

export function registerTool(
  registry: ToolRegistry,
  definition: ToolDefinition,
  handler: ToolHandler
): void {
  registry.set(definition.name, { definition, handler });
}

export function getToolDefinitions(registry: ToolRegistry): ToolDefinition[] {
  return [...registry.values()].map((t) => t.definition);
}

export function executeTool(
  registry: ToolRegistry,
  name: string,
  input: unknown,
  context: ToolContext
): Promise<string> {
  const tool = registry.get(name);
  if (!tool) {
    return Promise.resolve(`שגיאה: כלי "${name}" לא נמצא.`);
  }
  return tool.handler(input, context).catch((err: unknown) => {
    context.logger.error({ err, toolName: name }, 'tool execution error');
    return `שגיאה בהפעלת הכלי "${name}". נסו שוב.`;
  });
}
