import { describe, expect, it, vi, beforeEach } from 'vitest';
import { registerBusinessTools } from '../../../../src/services/whatsapp/tools/business-tools.js';
import { createToolRegistry, executeTool } from '../../../../src/services/whatsapp/types.js';
import type { ToolContext, ToolRegistry } from '../../../../src/services/whatsapp/types.js';
import { makeLogger } from '../../../utils/jobs.js';

// ── module-scope mocks ──

const mockFindBusinessesForUser = vi.fn();
const mockFindUserBusiness = vi.fn();
vi.mock('../../../../src/repositories/user-business-repository.js', () => ({
  findBusinessesForUser: (...args: unknown[]) => mockFindBusinessesForUser(...args),
  findUserBusiness: (...args: unknown[]) => mockFindUserBusiness(...args),
}));

const mockUpdateConversation = vi.fn();
vi.mock('../../../../src/repositories/whatsapp-repository.js', () => ({
  updateConversation: (...args: unknown[]) => mockUpdateConversation(...args),
}));

// ── helpers (module scope per S2004) ──

function makeContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: 'user-1',
    businessId: null,
    userRole: null,
    conversationId: 'conv-1',
    logger: makeLogger(),
    ...overrides,
  };
}

function makeRegistry(): ToolRegistry {
  const registry = createToolRegistry();
  registerBusinessTools(registry);
  return registry;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('list_businesses', () => {
  it('returns formatted list with roles', async () => {
    mockFindBusinessesForUser.mockResolvedValue([
      { id: 'biz-1', name: 'עסק א', role: 'owner' },
      { id: 'biz-2', name: 'עסק ב', role: 'admin' },
    ]);
    const registry = makeRegistry();

    const result = await executeTool(registry, 'list_businesses', {}, makeContext());

    expect(result).toContain('1. עסק א (בעלים)');
    expect(result).toContain('2. עסק ב (מנהל)');
  });

  it('returns empty message when no businesses', async () => {
    mockFindBusinessesForUser.mockResolvedValue([]);
    const registry = makeRegistry();

    const result = await executeTool(registry, 'list_businesses', {}, makeContext());

    expect(result).toContain('אין עסקים');
  });
});

describe('select_business', () => {
  it('updates activeBusinessId and returns name + role for valid member', async () => {
    mockFindUserBusiness.mockResolvedValue({
      role: 'owner',
      businessId: 'biz-1',
      userId: 'user-1',
    });
    mockFindBusinessesForUser.mockResolvedValue([
      { id: 'biz-1', name: 'חשמל בע"מ', role: 'owner' },
    ]);
    mockUpdateConversation.mockResolvedValue({});
    const registry = makeRegistry();

    const result = await executeTool(
      registry,
      'select_business',
      { businessId: 'biz-1' },
      makeContext()
    );

    expect(result).toContain('חשמל בע"מ');
    expect(result).toContain('בעלים');
    expect(mockUpdateConversation).toHaveBeenCalledWith('conv-1', { activeBusinessId: 'biz-1' });
  });

  it('returns error when user is not a member', async () => {
    mockFindUserBusiness.mockResolvedValue(null);
    const registry = makeRegistry();

    const result = await executeTool(
      registry,
      'select_business',
      { businessId: 'biz-99' },
      makeContext()
    );

    expect(result).toContain('אין לך גישה');
    expect(mockUpdateConversation).not.toHaveBeenCalled();
  });
});
