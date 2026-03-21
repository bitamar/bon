import { describe, expect, it, vi, beforeEach } from 'vitest';
import { registerInvoiceTools } from '../../../../src/services/whatsapp/tools/invoice-tools.js';
import { createToolRegistry, executeTool } from '../../../../src/services/whatsapp/types.js';
import type { ToolContext, ToolRegistry } from '../../../../src/services/whatsapp/types.js';
import { AppError } from '../../../../src/lib/app-error.js';
import { makeToolContext, makeInvoiceResponse } from './invoice-tools-helpers.js';

// ── module-scope mocks ──

const mockListCustomers = vi.fn();
vi.mock('../../../../src/services/customer-service.js', () => ({
  listCustomers: (...args: unknown[]) => mockListCustomers(...args),
}));

const mockCreateDraft = vi.fn();
const mockUpdateDraft = vi.fn();
const mockGetInvoice = vi.fn();
const mockFinalize = vi.fn();
const mockEnqueueShaamAllocation = vi.fn();
vi.mock('../../../../src/services/invoice-service.js', () => ({
  createDraft: (...args: unknown[]) => mockCreateDraft(...args),
  updateDraft: (...args: unknown[]) => mockUpdateDraft(...args),
  getInvoice: (...args: unknown[]) => mockGetInvoice(...args),
  finalize: (...args: unknown[]) => mockFinalize(...args),
  enqueueShaamAllocation: (...args: unknown[]) => mockEnqueueShaamAllocation(...args),
}));

const mockFindBusinessById = vi.fn();
vi.mock('../../../../src/repositories/business-repository.js', () => ({
  findBusinessById: (...args: unknown[]) => mockFindBusinessById(...args),
}));

const mockUpsertPendingAction = vi.fn();
const mockFindPendingAction = vi.fn();
const mockDeletePendingAction = vi.fn();
vi.mock('../../../../src/repositories/whatsapp-repository.js', () => ({
  upsertPendingAction: (...args: unknown[]) => mockUpsertPendingAction(...args),
  findPendingAction: (...args: unknown[]) => mockFindPendingAction(...args),
  deletePendingAction: (...args: unknown[]) => mockDeletePendingAction(...args),
}));

// ── helpers (module scope per S2004) ──

function makeRegistry(): ToolRegistry {
  const registry = createToolRegistry();
  registerInvoiceTools(registry);
  return registry;
}

function makeBusiness(overrides?: Record<string, unknown>) {
  return {
    id: 'biz-1',
    name: 'חשמל בע"מ',
    defaultVatRate: 1700,
    businessType: 'licensed_dealer',
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ── Business guard (all tools) ──

describe('business guard', () => {
  const toolNames = [
    'find_customer',
    'create_draft_invoice',
    'add_line_item',
    'remove_line_item',
    'get_draft_summary',
    'request_confirmation',
    'finalize_invoice',
  ];

  it.each(toolNames)('%s rejects when no business selected', async (toolName) => {
    const registry = makeRegistry();
    const result = await executeTool(registry, toolName, {}, makeToolContext({ businessId: null }));
    expect(result).toContain('יש לבחור עסק קודם');
  });
});

// ── find_customer ──

describe('find_customer', () => {
  // ── helpers ──
  async function runFindCustomer(query: string, ctx: ToolContext = makeToolContext()) {
    const registry = makeRegistry();
    return executeTool(registry, 'find_customer', { query }, ctx);
  }

  it('returns matching customers as JSON', async () => {
    mockListCustomers.mockResolvedValue({
      customers: [
        { id: 'cust-1', name: 'דוד לוי', taxId: '515303055', city: 'תל אביב' },
        { id: 'cust-2', name: 'דוד כהן', taxId: '123456789', city: 'חיפה' },
      ],
    });

    const result = await runFindCustomer('דוד');
    const parsed = JSON.parse(result);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      id: 'cust-1',
      name: 'דוד לוי',
      taxId: '515303055',
      city: 'תל אביב',
    });
    expect(mockListCustomers).toHaveBeenCalledWith('biz-1', 'דוד', true, 5);
  });

  it('returns message when no customers found', async () => {
    mockListCustomers.mockResolvedValue({ customers: [] });

    const result = await runFindCustomer('אין');

    expect(result).toContain('לא נמצאו לקוחות');
  });
});

// ── create_draft_invoice ──

describe('create_draft_invoice', () => {
  it('creates draft with correct defaults and returns ID', async () => {
    mockCreateDraft.mockResolvedValue({
      invoice: { id: 'inv-1', documentType: 'tax_invoice' },
      items: [],
      payments: [],
    });
    const registry = makeRegistry();

    const result = await executeTool(
      registry,
      'create_draft_invoice',
      { customerId: 'cust-1' },
      makeToolContext()
    );
    const parsed = JSON.parse(result);

    expect(parsed).toEqual({ invoiceId: 'inv-1', documentType: 'tax_invoice' });
    expect(mockCreateDraft).toHaveBeenCalledWith('biz-1', {
      documentType: 'tax_invoice',
      customerId: 'cust-1',
    });
  });

  it('passes custom document type', async () => {
    mockCreateDraft.mockResolvedValue({
      invoice: { id: 'inv-2', documentType: 'receipt' },
      items: [],
      payments: [],
    });
    const registry = makeRegistry();

    await executeTool(
      registry,
      'create_draft_invoice',
      { customerId: 'cust-1', documentType: 'receipt' },
      makeToolContext()
    );

    expect(mockCreateDraft).toHaveBeenCalledWith('biz-1', {
      documentType: 'receipt',
      customerId: 'cust-1',
    });
  });

  it('returns error string when service throws AppError', async () => {
    mockCreateDraft.mockRejectedValue(new AppError({ statusCode: 404, code: 'not_found' }));
    const registry = makeRegistry();

    const result = await executeTool(
      registry,
      'create_draft_invoice',
      { customerId: 'cust-bad' },
      makeToolContext()
    );

    expect(result).toContain('שגיאה');
  });
});

// ── add_line_item ──

describe('add_line_item', () => {
  it('converts shekel to minor units safely (handles 1.005)', async () => {
    const invoiceResp = makeInvoiceResponse();
    invoiceResp.items = [];
    mockGetInvoice.mockResolvedValue(invoiceResp);
    mockFindBusinessById.mockResolvedValue(makeBusiness());

    const updatedResp = makeInvoiceResponse();
    updatedResp.items = [
      {
        ...updatedResp.items[0]!,
        description: 'טסט',
        quantity: 1,
        unitPriceMinorUnits: 101, // 1.005 * 100 rounded
        lineTotalMinorUnits: 101,
      },
    ];
    mockUpdateDraft.mockResolvedValue(updatedResp);
    const registry = makeRegistry();

    await executeTool(
      registry,
      'add_line_item',
      { invoiceId: 'inv-1', description: 'טסט', quantity: 1, unitPrice: 1.005 },
      makeToolContext()
    );

    // Verify the unit price was converted safely (no floating-point rounding bug)
    const callArgs = mockUpdateDraft.mock.calls[0]!;
    const items = (callArgs[2] as { items: Array<{ unitPriceMinorUnits: number }> }).items;
    expect(items[0]!.unitPriceMinorUnits).toBe(101);
  });

  it('auto-sets vatRateBasisPoints from business default and position from item count', async () => {
    const invoiceResp = makeInvoiceResponse();
    mockGetInvoice.mockResolvedValue(invoiceResp);
    mockFindBusinessById.mockResolvedValue(makeBusiness({ defaultVatRate: 1700 }));
    mockUpdateDraft.mockResolvedValue(makeInvoiceResponse());
    const registry = makeRegistry();

    await executeTool(
      registry,
      'add_line_item',
      { invoiceId: 'inv-1', description: 'שירות חדש', quantity: 2, unitPrice: 100 },
      makeToolContext()
    );

    const callArgs = mockUpdateDraft.mock.calls[0]!;
    const items = (
      callArgs[2] as { items: Array<{ vatRateBasisPoints: number; position: number }> }
    ).items;
    const newItem = items.at(-1)!;
    expect(newItem.vatRateBasisPoints).toBe(1700);
    expect(newItem.position).toBe(1); // existing has 1 item, new gets position 1
  });

  it('loads existing items and sends full array (not just the new item)', async () => {
    const invoiceResp = makeInvoiceResponse();
    mockGetInvoice.mockResolvedValue(invoiceResp);
    mockFindBusinessById.mockResolvedValue(makeBusiness());

    const updatedResp = makeInvoiceResponse();
    updatedResp.items.push({
      id: 'item-2',
      invoiceId: 'inv-1',
      position: 1,
      description: 'פריט חדש',
      catalogNumber: null,
      quantity: 1,
      unitPriceMinorUnits: 5000,
      discountPercent: 0,
      vatRateBasisPoints: 1700,
      lineTotalMinorUnits: 5000,
      vatAmountMinorUnits: 850,
      lineTotalInclVatMinorUnits: 5850,
    });
    mockUpdateDraft.mockResolvedValue(updatedResp);
    const registry = makeRegistry();

    const result = await executeTool(
      registry,
      'add_line_item',
      { invoiceId: 'inv-1', description: 'פריט חדש', quantity: 1, unitPrice: 50 },
      makeToolContext()
    );

    const callArgs = mockUpdateDraft.mock.calls[0]!;
    const items = (callArgs[2] as { items: unknown[] }).items;
    expect(items).toHaveLength(2); // existing + new
    expect(result).toContain('נוסף');
    expect(result).toContain('פריט חדש');
  });

  it('returns formatted result with totals', async () => {
    const invoiceResp = makeInvoiceResponse();
    invoiceResp.items = [];
    mockGetInvoice.mockResolvedValue(invoiceResp);
    mockFindBusinessById.mockResolvedValue(makeBusiness());
    mockUpdateDraft.mockResolvedValue(makeInvoiceResponse());
    const registry = makeRegistry();

    const result = await executeTool(
      registry,
      'add_line_item',
      { invoiceId: 'inv-1', description: 'ייעוץ', quantity: 3, unitPrice: 400 },
      makeToolContext()
    );

    expect(result).toContain('נוסף: ייעוץ × 3');
    expect(result).toContain('₪1,200');
    expect(result).toContain('סה"כ כולל מע"מ');
    expect(result).toContain('₪1,404');
  });
});

// ── remove_line_item ──

describe('remove_line_item', () => {
  it('removes correct item and re-indexes positions', async () => {
    const invoiceResp = makeInvoiceResponse();
    invoiceResp.items.push({
      id: 'item-2',
      invoiceId: 'inv-1',
      position: 1,
      description: 'פריט שני',
      catalogNumber: null,
      quantity: 2,
      unitPriceMinorUnits: 5000,
      discountPercent: 0,
      vatRateBasisPoints: 1700,
      lineTotalMinorUnits: 10000,
      vatAmountMinorUnits: 1700,
      lineTotalInclVatMinorUnits: 11700,
    });
    mockGetInvoice.mockResolvedValue(invoiceResp);

    const updatedResp = makeInvoiceResponse();
    updatedResp.items = [{ ...invoiceResp.items[1]!, position: 0 }];
    updatedResp.invoice.totalInclVatMinorUnits = 11700;
    mockUpdateDraft.mockResolvedValue(updatedResp);
    const registry = makeRegistry();

    const result = await executeTool(
      registry,
      'remove_line_item',
      { invoiceId: 'inv-1', position: 0 },
      makeToolContext()
    );

    // Verify the remaining item was re-indexed to position 0
    const callArgs = mockUpdateDraft.mock.calls[0]!;
    const items = (callArgs[2] as { items: Array<{ position: number; description: string }> })
      .items;
    expect(items).toHaveLength(1);
    expect(items[0]!.position).toBe(0);
    expect(items[0]!.description).toBe('פריט שני');
    expect(result).toContain('הוסר: ייעוץ');
  });

  it('returns error for out of bounds position', async () => {
    mockGetInvoice.mockResolvedValue(makeInvoiceResponse());
    const registry = makeRegistry();

    const result = await executeTool(
      registry,
      'remove_line_item',
      { invoiceId: 'inv-1', position: 5 },
      makeToolContext()
    );

    expect(result).toContain('שגיאה');
    expect(result).toContain('לא קיים');
    expect(mockUpdateDraft).not.toHaveBeenCalled();
  });
});

// ── get_draft_summary ──

describe('get_draft_summary', () => {
  it('returns formatted summary with numbered items', async () => {
    mockGetInvoice.mockResolvedValue(makeInvoiceResponse());
    const registry = makeRegistry();

    const result = await executeTool(
      registry,
      'get_draft_summary',
      { invoiceId: 'inv-1' },
      makeToolContext()
    );

    expect(result).toContain('חשבונית טיוטה');
    expect(result).toContain('דוד לוי');
    expect(result).toContain('ייעוץ × 3');
    expect(result).toContain('₪1,200');
    expect(result).toContain('מע"מ');
    expect(result).toContain('סה"כ');
  });

  it('handles invoice with no customer name', async () => {
    const invoiceResp = makeInvoiceResponse();
    invoiceResp.invoice.customerName = null;
    mockGetInvoice.mockResolvedValue(invoiceResp);
    const registry = makeRegistry();

    const result = await executeTool(
      registry,
      'get_draft_summary',
      { invoiceId: 'inv-1' },
      makeToolContext()
    );

    expect(result).toContain('לא נבחר לקוח');
  });
});

// ── request_confirmation ──

describe('request_confirmation', () => {
  it('upserts pending action with draftRevision and returns summary', async () => {
    mockGetInvoice.mockResolvedValue(makeInvoiceResponse());
    mockUpsertPendingAction.mockResolvedValue({ id: 'pa-1' });
    const registry = makeRegistry();

    const result = await executeTool(
      registry,
      'request_confirmation',
      { invoiceId: 'inv-1' },
      makeToolContext()
    );

    expect(result).toContain('חשבונית טיוטה');
    expect(result).toContain('דוד לוי');
    expect(result).toContain('להפיק? (כן/לא)');
    expect(mockUpsertPendingAction).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        actionType: 'finalize_invoice',
        payload: JSON.stringify({
          invoiceId: 'inv-1',
          draftRevision: '2026-03-21T10:00:00.000Z',
        }),
      })
    );
    // Verify expiry is ~10 minutes from now
    const callArgs = mockUpsertPendingAction.mock.calls[0]![0] as { expiresAt: Date };
    const diffMs = callArgs.expiresAt.getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(9 * 60 * 1000);
    expect(diffMs).toBeLessThanOrEqual(10 * 60 * 1000 + 1000);
  });

  it('replaces existing pending action (same type, same conversation)', async () => {
    mockGetInvoice.mockResolvedValue(makeInvoiceResponse());
    mockUpsertPendingAction.mockResolvedValue({ id: 'pa-2' });
    const registry = makeRegistry();

    await executeTool(registry, 'request_confirmation', { invoiceId: 'inv-1' }, makeToolContext());

    // Upsert is called (not insert) — the DB handles the conflict
    expect(mockUpsertPendingAction).toHaveBeenCalledTimes(1);
  });

  it('returns error when invoice has no items', async () => {
    const invoiceResp = makeInvoiceResponse();
    invoiceResp.items = [];
    mockGetInvoice.mockResolvedValue(invoiceResp);
    const registry = makeRegistry();

    const result = await executeTool(
      registry,
      'request_confirmation',
      { invoiceId: 'inv-1' },
      makeToolContext()
    );

    expect(result).toContain('ללא פריטים');
    expect(mockUpsertPendingAction).not.toHaveBeenCalled();
  });
});

// ── finalize_invoice ──

describe('finalize_invoice', () => {
  // ── helpers ──
  function mockValidPendingAction(overrides?: Record<string, unknown>) {
    mockFindPendingAction.mockResolvedValue({
      id: 'pa-1',
      conversationId: 'conv-1',
      actionType: 'finalize_invoice',
      payload: JSON.stringify({
        invoiceId: 'inv-1',
        draftRevision: '2026-03-21T10:00:00.000Z',
      }),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      ...overrides,
    });
  }

  async function runFinalizeTool(
    args: Record<string, unknown> = { invoiceId: 'inv-1' },
    ctxOverrides?: Partial<ToolContext>
  ) {
    const registry = makeRegistry();
    const ctx = makeToolContext(ctxOverrides);
    return executeTool(registry, 'finalize_invoice', args, ctx);
  }

  beforeEach(() => {
    mockDeletePendingAction.mockResolvedValue(undefined);
    // Default: getInvoice returns the standard response (for draftRevision check)
    mockGetInvoice.mockResolvedValue(makeInvoiceResponse());
  });

  it('finalizes with valid pending action and returns success', async () => {
    mockValidPendingAction();
    const finalizedInvoice = makeInvoiceResponse();
    finalizedInvoice.invoice.status = 'finalized';
    finalizedInvoice.invoice.documentNumber = 'INV-0001';
    mockFinalize.mockResolvedValue({ ...finalizedInvoice, needsAllocation: false });

    const result = await runFinalizeTool();

    expect(result).toContain('INV-0001');
    expect(result).toContain('הופקה בהצלחה');
    expect(result).toContain('✓');
    expect(mockFinalize).toHaveBeenCalledWith('biz-1', 'inv-1', { vatExemptionReason: undefined });
    expect(mockDeletePendingAction).toHaveBeenCalledWith('pa-1');
  });

  it('enqueues SHAAM allocation when needsAllocation is true', async () => {
    mockValidPendingAction();
    const finalizedInvoice = makeInvoiceResponse();
    finalizedInvoice.invoice.documentNumber = 'INV-0002';
    mockFinalize.mockResolvedValue({ ...finalizedInvoice, needsAllocation: true });
    const ctx = makeToolContext();
    const registry = makeRegistry();

    await executeTool(registry, 'finalize_invoice', { invoiceId: 'inv-1' }, ctx);

    expect(mockEnqueueShaamAllocation).toHaveBeenCalledWith(ctx.boss, 'biz-1', 'inv-1', ctx.logger);
  });

  it('logs warning when needsAllocation but boss is absent', async () => {
    mockValidPendingAction();
    const finalizedInvoice = makeInvoiceResponse();
    finalizedInvoice.invoice.documentNumber = 'INV-0002';
    mockFinalize.mockResolvedValue({ ...finalizedInvoice, needsAllocation: true });
    const ctx = makeToolContext({ boss: undefined });
    const registry = makeRegistry();

    const result = await executeTool(registry, 'finalize_invoice', { invoiceId: 'inv-1' }, ctx);

    // Invoice still issued successfully even without boss
    expect(result).toContain('הופקה בהצלחה');
    expect(mockEnqueueShaamAllocation).not.toHaveBeenCalled();
  });

  it('returns success even if deletePendingAction fails', async () => {
    mockValidPendingAction();
    const finalizedInvoice = makeInvoiceResponse();
    finalizedInvoice.invoice.documentNumber = 'INV-0005';
    mockFinalize.mockResolvedValue({ ...finalizedInvoice, needsAllocation: false });
    mockDeletePendingAction.mockRejectedValue(new Error('DB error'));

    const result = await runFinalizeTool();

    // Invoice was already committed — user sees success
    expect(result).toContain('הופקה בהצלחה');
  });

  it('returns error without pending action', async () => {
    mockFindPendingAction.mockResolvedValue(null);

    const result = await runFinalizeTool();

    expect(result).toContain('לא נמצא אישור תקף');
    expect(mockFinalize).not.toHaveBeenCalled();
  });

  it('returns error with expired pending action (findPendingAction filters by expiry)', async () => {
    // findPendingAction already filters expired rows, so it returns null
    mockFindPendingAction.mockResolvedValue(null);

    const result = await runFinalizeTool();

    expect(result).toContain('לא נמצא אישור תקף');
  });

  it('returns error when pending action has mismatched invoiceId', async () => {
    mockValidPendingAction({
      payload: JSON.stringify({
        invoiceId: 'inv-OTHER',
        draftRevision: '2026-03-21T10:00:00.000Z',
      }),
    });

    const result = await runFinalizeTool();

    expect(result).toContain('לא נמצא אישור תקף');
    expect(mockFinalize).not.toHaveBeenCalled();
  });

  it('returns error when draft was modified after approval', async () => {
    mockValidPendingAction();
    // Return an invoice with a different updatedAt than the stored draftRevision
    const modifiedInvoice = makeInvoiceResponse({ updatedAt: '2026-03-21T11:00:00.000Z' });
    mockGetInvoice.mockResolvedValue(modifiedInvoice);

    const result = await runFinalizeTool();

    expect(result).toContain('שונתה מאז האישור');
    expect(mockFinalize).not.toHaveBeenCalled();
  });

  it('rejects users with role "user"', async () => {
    const result = await runFinalizeTool({ invoiceId: 'inv-1' }, { userRole: 'user' });

    expect(result).toContain('אין לך הרשאה');
    expect(mockFinalize).not.toHaveBeenCalled();
    expect(mockFindPendingAction).not.toHaveBeenCalled();
  });

  it('rejects null role (default-deny)', async () => {
    const result = await runFinalizeTool({ invoiceId: 'inv-1' }, { userRole: null });

    expect(result).toContain('אין לך הרשאה');
    expect(mockFinalize).not.toHaveBeenCalled();
  });

  it('returns Hebrew prompt for zero-VAT without exemption reason', async () => {
    mockValidPendingAction();
    mockFinalize.mockRejectedValue(
      new AppError({ statusCode: 422, code: 'missing_vat_exemption_reason' })
    );

    const result = await runFinalizeTool();

    expect(result).toContain('ללא מע"מ');
    expect(result).toContain('סיבת פטור');
  });

  it('succeeds with vatExemptionReason for zero-VAT invoice', async () => {
    mockValidPendingAction();
    const finalizedInvoice = makeInvoiceResponse();
    finalizedInvoice.invoice.documentNumber = 'INV-0003';
    mockFinalize.mockResolvedValue({ ...finalizedInvoice, needsAllocation: false });

    const result = await runFinalizeTool({ invoiceId: 'inv-1', vatExemptionReason: 'עסקה פטורה' });

    expect(result).toContain('הופקה בהצלחה');
    expect(mockFinalize).toHaveBeenCalledWith('biz-1', 'inv-1', {
      vatExemptionReason: 'עסקה פטורה',
    });
  });

  it('allows admin role to finalize', async () => {
    mockValidPendingAction();
    const finalizedInvoice = makeInvoiceResponse();
    finalizedInvoice.invoice.documentNumber = 'INV-0004';
    mockFinalize.mockResolvedValue({ ...finalizedInvoice, needsAllocation: false });

    const result = await runFinalizeTool({ invoiceId: 'inv-1' }, { userRole: 'admin' });

    expect(result).toContain('הופקה בהצלחה');
  });
});
