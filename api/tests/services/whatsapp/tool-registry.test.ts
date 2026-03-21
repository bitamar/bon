import { describe, expect, it, vi } from 'vitest';
import {
  createToolRegistry,
  registerTool,
  getToolDefinitions,
  executeTool,
} from '../../../src/services/whatsapp/types.js';
import type {
  ToolContext,
  ToolDefinition,
  ToolHandler,
} from '../../../src/services/whatsapp/types.js';
import { makeLogger } from '../../utils/jobs.js';

function makeContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: 'user-1',
    businessId: 'biz-1',
    userRole: 'owner',
    conversationId: 'conv-1',
    logger: makeLogger(),
    ...overrides,
  };
}

function makeDefinition(name: string): ToolDefinition {
  return {
    name,
    description: `Tool ${name}`,
    input_schema: { type: 'object', properties: {}, required: [] },
  };
}

describe('ToolRegistry', () => {
  it('registers and executes a tool', async () => {
    const registry = createToolRegistry();
    const handler: ToolHandler = vi.fn().mockResolvedValue('result-ok');
    registerTool(registry, makeDefinition('test_tool'), handler);

    const result = await executeTool(registry, 'test_tool', { foo: 1 }, makeContext());

    expect(result).toBe('result-ok');
    expect(handler).toHaveBeenCalledWith({ foo: 1 }, expect.objectContaining({ userId: 'user-1' }));
  });

  it('returns error string for unknown tool', async () => {
    const registry = createToolRegistry();

    const result = await executeTool(registry, 'nonexistent', {}, makeContext());

    expect(result).toContain('nonexistent');
    expect(result).toContain('שגיאה');
  });

  it('catches handler errors and returns error string', async () => {
    const registry = createToolRegistry();
    const handler: ToolHandler = vi.fn().mockRejectedValue(new Error('boom'));
    registerTool(registry, makeDefinition('failing_tool'), handler);

    const result = await executeTool(registry, 'failing_tool', {}, makeContext());

    expect(result).toContain('שגיאה');
    expect(result).toContain('failing_tool');
  });

  it('getToolDefinitions returns all registered definitions', () => {
    const registry = createToolRegistry();
    registerTool(registry, makeDefinition('tool_a'), vi.fn());
    registerTool(registry, makeDefinition('tool_b'), vi.fn());

    const defs = getToolDefinitions(registry);

    expect(defs).toHaveLength(2);
    expect(defs.map((d) => d.name)).toEqual(['tool_a', 'tool_b']);
  });
});
