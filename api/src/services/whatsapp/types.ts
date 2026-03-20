import type { FastifyBaseLogger } from 'fastify';
import type { PgBoss } from 'pg-boss';
import type { BusinessRole } from '@bon/types/businesses';

export interface ToolContext {
  userId: string;
  businessId: string;
  userRole: BusinessRole;
  conversationId: string;
  logger: FastifyBaseLogger;
  boss?: PgBoss;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
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
