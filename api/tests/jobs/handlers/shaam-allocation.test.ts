import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'pg-boss';
import type { FastifyBaseLogger } from 'fastify';
import { createShaamAllocationHandler } from '../../../src/jobs/handlers/shaam-allocation.js';
import type { ShaamService } from '../../../src/services/shaam/types.js';

// Mock repositories
vi.mock('../../../src/repositories/invoice-repository.js', () => ({
  findInvoiceById: vi.fn(),
  findItemsByInvoiceId: vi.fn(),
  updateInvoice: vi.fn(),
}));

vi.mock('../../../src/repositories/business-repository.js', () => ({
  findBusinessById: vi.fn(),
}));

vi.mock('../../../src/repositories/customer-repository.js', () => ({
  findCustomerById: vi.fn(),
}));

vi.mock('../../../src/repositories/shaam-audit-log-repository.js', () => ({
  insertShaamAuditLog: vi.fn(),
}));

import {
  findInvoiceById,
  findItemsByInvoiceId,
  updateInvoice,
} from '../../../src/repositories/invoice-repository.js';
import { findBusinessById } from '../../../src/repositories/business-repository.js';
import { findCustomerById } from '../../../src/repositories/customer-repository.js';
import { insertShaamAuditLog } from '../../../src/repositories/shaam-audit-log-repository.js';

const BUSINESS_ID = '00000000-0000-0000-0000-000000000001';
const INVOICE_ID = '00000000-0000-0000-0000-000000000002';
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000003';

const MOCK_INVOICE = {
  id: INVOICE_ID,
  businessId: BUSINESS_ID,
  customerId: CUSTOMER_ID,
  documentType: 'tax_invoice',
  documentNumber: 'INV-0001',
  invoiceDate: '2026-03-01',
  customerName: 'Test Customer',
  customerTaxId: '123456789',
  customerAddress: 'Tel Aviv',
  customerEmail: 'test@example.com',
  totalExclVatMinorUnits: 100_000,
  vatMinorUnits: 17_000,
  totalInclVatMinorUnits: 117_000,
  currency: 'ILS',
  allocationStatus: 'pending',
  allocationNumber: null,
  allocationError: null,
  status: 'finalized',
};

const MOCK_ITEMS = [
  {
    id: 'item-1',
    invoiceId: INVOICE_ID,
    position: 1,
    description: 'Service',
    catalogNumber: null,
    quantity: '1',
    unitPriceMinorUnits: 100_000,
    discountPercent: '0',
    vatRateBasisPoints: 1700,
    lineTotalMinorUnits: 100_000,
    vatAmountMinorUnits: 17_000,
    lineTotalInclVatMinorUnits: 117_000,
  },
];

const MOCK_BUSINESS = {
  id: BUSINESS_ID,
  vatNumber: '987654321',
};

const MOCK_CUSTOMER = {
  id: CUSTOMER_ID,
  name: 'Test Customer',
  isLicensedDealer: true,
  isActive: true,
};

type PayloadType = { businessId: string; invoiceId: string };

// ── helpers ──

function createMockShaamService(): ShaamService {
  return {
    requestAllocationNumber: vi.fn().mockResolvedValue({
      status: 'approved',
      allocationNumber: '123456789',
    }),
  };
}

function createMockApp(shaamService?: ShaamService) {
  return {
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as FastifyBaseLogger,
    shaamService: shaamService ?? createMockShaamService(),
  } as unknown as Parameters<typeof createShaamAllocationHandler>[0];
}

function createMockJobs(): Job<PayloadType>[] {
  return [
    {
      id: 'job-1',
      name: 'shaam-allocation-request',
      data: { businessId: BUSINESS_ID, invoiceId: INVOICE_ID },
    } as Job<PayloadType>,
  ];
}

function setupMocks() {
  vi.mocked(findInvoiceById).mockResolvedValue(MOCK_INVOICE as never);
  vi.mocked(findItemsByInvoiceId).mockResolvedValue(MOCK_ITEMS as never);
  vi.mocked(findBusinessById).mockResolvedValue(MOCK_BUSINESS as never);
  vi.mocked(findCustomerById).mockResolvedValue(MOCK_CUSTOMER as never);
  vi.mocked(updateInvoice).mockResolvedValue(MOCK_INVOICE as never);
  vi.mocked(insertShaamAuditLog).mockResolvedValue(null);
}

describe('shaam-allocation handler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupMocks();
  });

  it('stores allocation number when SHAAM approves', async () => {
    const shaamService = createMockShaamService();
    const app = createMockApp(shaamService);
    const handler = createShaamAllocationHandler(app);

    await handler(createMockJobs());

    expect(updateInvoice).toHaveBeenCalledWith(INVOICE_ID, BUSINESS_ID, {
      allocationStatus: 'approved',
      allocationNumber: '123456789',
      allocationError: null,
      updatedAt: expect.any(Date),
    });
    expect(insertShaamAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: BUSINESS_ID,
        invoiceId: INVOICE_ID,
        result: 'approved',
        allocationNumber: '123456789',
      })
    );
  });

  it('stores error when SHAAM rejects', async () => {
    const shaamService: ShaamService = {
      requestAllocationNumber: vi.fn().mockResolvedValue({
        status: 'rejected',
        errorCode: 'E001',
        errorMessage: 'Invalid VAT number',
      }),
    };
    const handler = createShaamAllocationHandler(createMockApp(shaamService));

    await handler(createMockJobs());

    expect(updateInvoice).toHaveBeenCalledWith(INVOICE_ID, BUSINESS_ID, {
      allocationStatus: 'rejected',
      allocationError: 'E001: Invalid VAT number',
      updatedAt: expect.any(Date),
    });
    expect(insertShaamAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'rejected',
        errorCode: 'E001',
      })
    );
  });

  it('throws on deferred to trigger pg-boss retry', async () => {
    const shaamService: ShaamService = {
      requestAllocationNumber: vi.fn().mockResolvedValue({
        status: 'deferred',
        reason: 'System maintenance',
      }),
    };
    const handler = createShaamAllocationHandler(createMockApp(shaamService));

    await expect(handler(createMockJobs())).rejects.toThrow('SHAAM deferred: System maintenance');
    expect(updateInvoice).toHaveBeenCalledWith(INVOICE_ID, BUSINESS_ID, {
      allocationStatus: 'pending',
      allocationError: 'System maintenance',
      updatedAt: expect.any(Date),
    });
  });

  it('skips already-approved invoices', async () => {
    vi.mocked(findInvoiceById).mockResolvedValue({
      ...MOCK_INVOICE,
      allocationStatus: 'approved',
    } as never);

    const shaamService = createMockShaamService();
    const handler = createShaamAllocationHandler(createMockApp(shaamService));

    await handler(createMockJobs());

    expect(shaamService.requestAllocationNumber).not.toHaveBeenCalled();
    expect(updateInvoice).not.toHaveBeenCalled();
  });

  it('skips when invoice not found', async () => {
    vi.mocked(findInvoiceById).mockResolvedValue(null);

    const shaamService = createMockShaamService();
    const handler = createShaamAllocationHandler(createMockApp(shaamService));

    await handler(createMockJobs());

    expect(shaamService.requestAllocationNumber).not.toHaveBeenCalled();
  });

  it('throws on service error to trigger retry and logs audit entry', async () => {
    const shaamService: ShaamService = {
      requestAllocationNumber: vi.fn().mockRejectedValue(new Error('Network timeout')),
    };
    const handler = createShaamAllocationHandler(createMockApp(shaamService));

    await expect(handler(createMockJobs())).rejects.toThrow('Network timeout');
    expect(insertShaamAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'error',
        responsePayload: null,
      })
    );
    expect(updateInvoice).toHaveBeenCalledWith(INVOICE_ID, BUSINESS_ID, {
      allocationStatus: 'pending',
      allocationError: 'Network timeout',
      updatedAt: expect.any(Date),
    });
  });
});
