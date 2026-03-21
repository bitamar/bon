import { vi } from 'vitest';
import type { ToolContext } from '../../../../src/services/whatsapp/types.js';
import { makeLogger } from '../../../utils/jobs.js';

export function makeToolContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: 'user-1',
    businessId: 'biz-1',
    userRole: 'owner',
    conversationId: 'conv-1',
    logger: makeLogger(),
    boss: { send: vi.fn() } as never,
    ...overrides,
  };
}

export function makeInvoiceResponse(overrides?: Record<string, unknown>) {
  return {
    invoice: {
      id: 'inv-1',
      businessId: 'biz-1',
      customerId: 'cust-1',
      customerName: 'דוד לוי',
      customerTaxId: null,
      customerAddress: null,
      customerEmail: null,
      documentType: 'tax_invoice',
      status: 'draft',
      isOverdue: false,
      sequenceGroup: null,
      sequenceNumber: null,
      documentNumber: null,
      creditedInvoiceId: null,
      invoiceDate: '2026-03-21',
      issuedAt: null,
      dueDate: null,
      notes: null,
      internalNotes: null,
      currency: 'ILS',
      vatExemptionReason: null,
      subtotalMinorUnits: 120000,
      discountMinorUnits: 0,
      totalExclVatMinorUnits: 120000,
      vatMinorUnits: 20400,
      totalInclVatMinorUnits: 140400,
      allocationStatus: null,
      allocationNumber: null,
      allocationError: null,
      sentAt: null,
      paidAt: null,
      createdAt: '2026-03-21T10:00:00.000Z',
      updatedAt: '2026-03-21T10:00:00.000Z',
      ...overrides,
    },
    items: [
      {
        id: 'item-1',
        invoiceId: 'inv-1',
        position: 0,
        description: 'ייעוץ',
        catalogNumber: null,
        quantity: 3,
        unitPriceMinorUnits: 40000,
        discountPercent: 0,
        vatRateBasisPoints: 1700,
        lineTotalMinorUnits: 120000,
        vatAmountMinorUnits: 20400,
        lineTotalInclVatMinorUnits: 140400,
      },
    ],
    payments: [],
    remainingBalanceMinorUnits: 140400,
  };
}

export interface InvoiceToolMocks {
  listCustomers: ReturnType<typeof vi.fn>;
  createDraft: ReturnType<typeof vi.fn>;
  updateDraft: ReturnType<typeof vi.fn>;
  getInvoice: ReturnType<typeof vi.fn>;
  finalize: ReturnType<typeof vi.fn>;
  enqueueShaamAllocation: ReturnType<typeof vi.fn>;
  findBusinessById: ReturnType<typeof vi.fn>;
  upsertPendingAction: ReturnType<typeof vi.fn>;
  findPendingAction: ReturnType<typeof vi.fn>;
  deletePendingAction: ReturnType<typeof vi.fn>;
}

export function createInvoiceToolMocks(): InvoiceToolMocks {
  return {
    listCustomers: vi.fn(),
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    getInvoice: vi.fn(),
    finalize: vi.fn(),
    enqueueShaamAllocation: vi.fn(),
    findBusinessById: vi.fn(),
    upsertPendingAction: vi.fn(),
    findPendingAction: vi.fn(),
    deletePendingAction: vi.fn(),
  };
}
