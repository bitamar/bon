import type { PgBoss } from 'pg-boss';
import type { ZodType } from 'zod';
import type { BusinessRole } from '@bon/types/businesses';
import type { ToolDefinition } from '@bon/types/whatsapp';

export type { ToolDefinition } from '@bon/types/whatsapp';

export interface Logger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
  debug(obj: object, msg?: string): void;
}

export interface ToolContext {
  userId: string;
  businessId: string;
  userRole: BusinessRole;
  conversationId: string;
  logger: Logger;
  boss?: PgBoss;
}

export type ToolHandler = (input: unknown, context: ToolContext) => Promise<string>;

export interface RegisteredTool {
  definition: ToolDefinition;
  inputSchema?: ZodType<unknown>;
  handler: ToolHandler;
}

export type ToolRegistry = Map<string, RegisteredTool>;

export function createToolRegistry(): ToolRegistry {
  return new Map();
}

export function registerTool(
  registry: ToolRegistry,
  definition: ToolDefinition,
  handler: ToolHandler,
  inputSchema?: ZodType<unknown>
): void {
  const tool: RegisteredTool = inputSchema
    ? { definition, handler, inputSchema }
    : { definition, handler };
  registry.set(definition.name, tool);
}

export function getToolDefinitions(registry: ToolRegistry): ToolDefinition[] {
  return [...registry.values()].map((t) => t.definition);
}

export async function executeTool(
  registry: ToolRegistry,
  name: string,
  input: unknown,
  context: ToolContext
): Promise<string> {
  const tool = registry.get(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  const validated = tool.inputSchema ? await tool.inputSchema.parseAsync(input) : input;
  return tool.handler(validated, context);
}
