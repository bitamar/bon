import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createToolRegistry,
  registerTool,
  getToolDefinitions,
  executeTool,
} from '../../src/services/whatsapp/types.js';
import type { ToolContext, ToolHandler, Logger } from '../../src/services/whatsapp/types.js';

// ── helpers ──

function makeDummyHandler(response: string): ToolHandler {
  return async () => response;
}

function makeTestLogger(): Logger {
  return { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} };
}

function makeDummyContext(): ToolContext {
  return {
    userId: '00000000-0000-0000-0000-000000000001',
    businessId: '00000000-0000-0000-0000-000000000002',
    userRole: 'owner',
    conversationId: '00000000-0000-0000-0000-000000000003',
    logger: makeTestLogger(),
  };
}

describe('ToolRegistry', () => {
  it('creates an empty registry', () => {
    const registry = createToolRegistry();
    expect(registry.size).toBe(0);
    expect(getToolDefinitions(registry)).toEqual([]);
  });

  it('registers and retrieves a tool', () => {
    const registry = createToolRegistry();

    registerTool(
      registry,
      {
        name: 'find_customer',
        description: 'חפש לקוח לפי שם או מספר זהות',
        input_schema: { type: 'object', properties: { query: { type: 'string' } } },
      },
      makeDummyHandler('found')
    );

    expect(registry.size).toBe(1);
    const tool = registry.get('find_customer');
    expect(tool).toBeDefined();
    expect(tool!.definition.name).toBe('find_customer');
  });

  it('returns all tool definitions', () => {
    const registry = createToolRegistry();

    registerTool(
      registry,
      { name: 'tool_a', description: 'A', input_schema: {} },
      makeDummyHandler('a')
    );
    registerTool(
      registry,
      { name: 'tool_b', description: 'B', input_schema: {} },
      makeDummyHandler('b')
    );

    const defs = getToolDefinitions(registry);
    expect(defs).toHaveLength(2);
    const names = defs.map((d) => d.name);
    expect(names).toContain('tool_a');
    expect(names).toContain('tool_b');
  });

  it('executes a tool handler with context', async () => {
    const registry = createToolRegistry();

    registerTool(
      registry,
      { name: 'greet', description: 'Say hello', input_schema: {} },
      async (_input, ctx) => `Hello ${ctx.userId}`
    );

    const result = await executeTool(registry, 'greet', {}, makeDummyContext());
    expect(result).toBe('Hello 00000000-0000-0000-0000-000000000001');
  });

  it('overwrites a tool with the same name', () => {
    const registry = createToolRegistry();

    registerTool(
      registry,
      { name: 'dup', description: 'first', input_schema: {} },
      makeDummyHandler('1')
    );
    registerTool(
      registry,
      { name: 'dup', description: 'second', input_schema: {} },
      makeDummyHandler('2')
    );

    expect(registry.size).toBe(1);
    expect(registry.get('dup')!.definition.description).toBe('second');
  });

  it('validates input against Zod schema before executing', async () => {
    const registry = createToolRegistry();
    const inputSchema = z.object({ query: z.string().min(1) });

    registerTool(
      registry,
      { name: 'search', description: 'Search', input_schema: {} },
      async (input) => `searched: ${(input as { query: string }).query}`,
      inputSchema
    );

    const result = await executeTool(registry, 'search', { query: 'test' }, makeDummyContext());
    expect(result).toBe('searched: test');
  });

  it('rejects invalid input when Zod schema is provided', async () => {
    const registry = createToolRegistry();
    const inputSchema = z.object({ query: z.string().min(1) });

    registerTool(
      registry,
      { name: 'search', description: 'Search', input_schema: {} },
      makeDummyHandler('should not reach'),
      inputSchema
    );

    await expect(
      executeTool(registry, 'search', { query: '' }, makeDummyContext())
    ).rejects.toThrow();
  });

  it('throws for unknown tool name', async () => {
    const registry = createToolRegistry();

    await expect(executeTool(registry, 'nonexistent', {}, makeDummyContext())).rejects.toThrow(
      'Unknown tool: nonexistent'
    );
  });

  it('skips validation when no inputSchema is provided', async () => {
    const registry = createToolRegistry();

    registerTool(
      registry,
      { name: 'simple', description: 'No schema', input_schema: {} },
      async (input) => JSON.stringify(input)
    );

    const result = await executeTool(registry, 'simple', { anything: true }, makeDummyContext());
    expect(result).toBe('{"anything":true}');
  });
});
