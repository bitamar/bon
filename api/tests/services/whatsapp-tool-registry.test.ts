import { describe, expect, it } from 'vitest';
import {
  createToolRegistry,
  registerTool,
  getToolDefinitions,
} from '../../src/services/whatsapp/types.js';
import type { ToolContext, ToolHandler } from '../../src/services/whatsapp/types.js';

// ── helpers ──

function makeDummyHandler(response: string): ToolHandler {
  return async () => response;
}

function makeDummyContext(): ToolContext {
  return {
    userId: '00000000-0000-0000-0000-000000000001',
    businessId: '00000000-0000-0000-0000-000000000002',
    userRole: 'owner',
    conversationId: '00000000-0000-0000-0000-000000000003',
    logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} } as never,
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
    expect(defs.map((d) => d.name).sort()).toEqual(['tool_a', 'tool_b']);
  });

  it('executes a tool handler with context', async () => {
    const registry = createToolRegistry();

    registerTool(
      registry,
      { name: 'greet', description: 'Say hello', input_schema: {} },
      async (input, ctx) => `Hello ${ctx.userId}`
    );

    const tool = registry.get('greet')!;
    const result = await tool.handler({}, makeDummyContext());

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
});
