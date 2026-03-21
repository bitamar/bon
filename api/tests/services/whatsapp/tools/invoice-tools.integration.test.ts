import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createToolRegistry } from '../../../../src/services/whatsapp/types.js';
import type { ToolRegistry } from '../../../../src/services/whatsapp/types.js';
import { registerInvoiceTools } from '../../../../src/services/whatsapp/tools/invoice-tools.js';
import { registerBusinessTools } from '../../../../src/services/whatsapp/tools/business-tools.js';
import { runToolLoop } from '../../../../src/services/whatsapp/tool-loop.js';
import type { ClaudeClient, ClaudeResponse } from '../../../../src/services/llm/claude-client.js';
import { makeToolContext, makeInvoiceResponse } from './invoice-tools-helpers.js';

// ── module-scope mocks ──

const mockListCustomers = vi.fn();
vi.mock('../../../../src/services/customer-service.js', () => ({
  listCustomers: (...args: unknown[]) => mockListCustomers(...args),
}));

const mockCreateDraft = vi.fn();
const mockUpdateDraft = vi.fn();
const mockGetInvoice = vi.fn();
vi.mock('../../../../src/services/invoice-service.js', () => ({
  createDraft: (...args: unknown[]) => mockCreateDraft(...args),
  updateDraft: (...args: unknown[]) => mockUpdateDraft(...args),
  getInvoice: (...args: unknown[]) => mockGetInvoice(...args),
  finalize: vi.fn(),
  enqueueShaamAllocation: vi.fn(),
}));

const mockFindBusinessById = vi.fn();
vi.mock('../../../../src/repositories/business-repository.js', () => ({
  findBusinessById: (...args: unknown[]) => mockFindBusinessById(...args),
}));

const mockUpsertPendingAction = vi.fn();
vi.mock('../../../../src/repositories/whatsapp-repository.js', () => ({
  upsertPendingAction: (...args: unknown[]) => mockUpsertPendingAction(...args),
  findPendingAction: vi.fn(),
  deletePendingAction: vi.fn(),
}));

vi.mock('../../../../src/repositories/user-business-repository.js', () => ({
  findBusinessesForUser: vi.fn(),
  findUserBusiness: vi.fn(),
}));

// ── helpers ──

function makeFullRegistry(): ToolRegistry {
  const registry = createToolRegistry();
  registerBusinessTools(registry);
  registerInvoiceTools(registry);
  return registry;
}

function makeClaudeResponse(content: ClaudeResponse['content']): ClaudeResponse {
  return {
    id: 'msg-1',
    type: 'message',
    role: 'assistant',
    content,
    model: 'claude-sonnet-4-20250514',
    stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('invoice creation full flow (mocked Claude)', () => {
  it('find_customer → create_draft → add_line_item → request_confirmation → text response', async () => {
    // Setup mocks for all services
    mockListCustomers.mockResolvedValue({
      customers: [{ id: 'cust-1', name: 'דוד לוי', taxId: '515303055', city: 'תל אביב' }],
    });
    mockCreateDraft.mockResolvedValue({
      invoice: { id: 'inv-1', documentType: 'tax_invoice' },
      items: [],
      payments: [],
    });
    mockFindBusinessById.mockResolvedValue({
      id: 'biz-1',
      name: 'חשמל בע"מ',
      defaultVatRate: 1700,
    });

    // First getInvoice call (from add_line_item) — empty items
    const emptyInvoice = makeInvoiceResponse();
    emptyInvoice.items = [];

    // Second getInvoice call (from request_confirmation) — has items
    const invoiceWithItems = makeInvoiceResponse();

    mockGetInvoice.mockResolvedValueOnce(emptyInvoice).mockResolvedValueOnce(invoiceWithItems);

    mockUpdateDraft.mockResolvedValue(invoiceWithItems);
    mockUpsertPendingAction.mockResolvedValue({ id: 'pa-1' });

    // Mock Claude responses for each iteration of the tool loop
    const claudeResponses: ClaudeResponse[] = [
      // 1. Claude calls find_customer
      makeClaudeResponse([
        { type: 'tool_use', id: 'tc-1', name: 'find_customer', input: { query: 'דוד לוי' } },
      ]),
      // 2. Claude calls create_draft_invoice
      makeClaudeResponse([
        {
          type: 'tool_use',
          id: 'tc-2',
          name: 'create_draft_invoice',
          input: { customerId: 'cust-1' },
        },
      ]),
      // 3. Claude calls add_line_item
      makeClaudeResponse([
        {
          type: 'tool_use',
          id: 'tc-3',
          name: 'add_line_item',
          input: { invoiceId: 'inv-1', description: 'ייעוץ', quantity: 3, unitPrice: 400 },
        },
      ]),
      // 4. Claude calls request_confirmation
      makeClaudeResponse([
        {
          type: 'tool_use',
          id: 'tc-4',
          name: 'request_confirmation',
          input: { invoiceId: 'inv-1' },
        },
      ]),
      // 5. Claude returns final text
      makeClaudeResponse([
        {
          type: 'text',
          text: 'חשבונית טיוטה:\nלקוח: דוד לוי\n1. ייעוץ × 3 — ₪1,200\nמע"מ 17%: ₪204\nסה"כ: ₪1,404\n\nלהפיק? (כן/לא)',
        },
      ]),
    ];

    const mockSendMessage = vi.fn();
    for (const resp of claudeResponses) {
      mockSendMessage.mockResolvedValueOnce(resp);
    }
    const claudeClient: ClaudeClient = { sendMessage: mockSendMessage };

    const storedMessages: Array<{
      role: string;
      toolName: string | null;
      toolCallId: string | null;
      body: string;
    }> = [];

    const storeMessage = vi.fn(
      async (
        role: 'assistant' | 'tool_call' | 'tool_result',
        toolName: string | null,
        toolCallId: string | null,
        body: string
      ) => {
        storedMessages.push({ role, toolName, toolCallId, body });
      }
    );

    const registry = makeFullRegistry();
    const context = makeToolContext();

    const finalText = await runToolLoop({
      claudeClient,
      toolRegistry: registry,
      systemPrompt: 'You are a helpful invoice assistant.',
      messages: [{ role: 'user', content: 'תעשה חשבונית לדוד לוי על 3 שעות ייעוץ ב-400 שקל' }],
      context,
      storeMessage,
    });

    // Verify all tool calls were made
    expect(mockListCustomers).toHaveBeenCalledWith('biz-1', 'דוד לוי', true, 5);
    expect(mockCreateDraft).toHaveBeenCalledWith('biz-1', {
      documentType: 'tax_invoice',
      customerId: 'cust-1',
    });
    expect(mockUpdateDraft).toHaveBeenCalled();
    expect(mockUpsertPendingAction).toHaveBeenCalled();

    // Verify messages stored in correct order
    const toolCalls = storedMessages.filter((m) => m.role === 'tool_call');
    const toolResults = storedMessages.filter((m) => m.role === 'tool_result');
    expect(toolCalls).toHaveLength(4);
    expect(toolResults).toHaveLength(4);
    expect(toolCalls[0]!.toolName).toBe('find_customer');
    expect(toolCalls[1]!.toolName).toBe('create_draft_invoice');
    expect(toolCalls[2]!.toolName).toBe('add_line_item');
    expect(toolCalls[3]!.toolName).toBe('request_confirmation');

    // Verify final text response stored
    const assistantMessages = storedMessages.filter(
      (m) => m.role === 'assistant' && m.toolName === null
    );
    expect(assistantMessages).toHaveLength(1);
    expect(finalText).toContain('להפיק?');

    // Verify Claude was called 5 times (4 tool iterations + final text)
    expect(mockSendMessage).toHaveBeenCalledTimes(5);
  });
});
