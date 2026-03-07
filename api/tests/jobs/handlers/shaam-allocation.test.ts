import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'pg-boss';
import type { FastifyBaseLogger } from 'fastify';
import { createShaamAllocationHandler } from '../../../src/jobs/handlers/shaam-allocation.js';
import type { ShaamService } from '../../../src/services/shaam/types.js';
import type { JobPayloads } from '../../../src/jobs/boss.js';

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

vi.mock('../../../src/repositories/emergency-allocation-repository.js', () => ({
  consumeNext: vi.fn(),
}));

vi.mock('../../../src/repositories/shaam-credentials-repository.js', () => ({
  markNeedsReauth: vi.fn(),
}));

vi.mock('../../../src/services/shaam/build-ita-payload.js', () => ({
  buildItaPayload: vi.fn().mockReturnValue({ mocked: true }),
}));

import {
  findInvoiceById,
  findItemsByInvoiceId,
  updateInvoice,
} from '../../../src/repositories/invoice-repository.js';
import { findBusinessById } from '../../../src/repositories/business-repository.js';
import { findCustomerById } from '../../../src/repositories/customer-repository.js';
import { insertShaamAuditLog } from '../../../src/repositories/shaam-audit-log-repository.js';
import { consumeNext } from '../../../src/repositories/emergency-allocation-repository.js';
import { markNeedsReauth } from '../../../src/repositories/shaam-credentials-repository.js';
import { buildItaPayload } from '../../../src/services/shaam/build-ita-payload.js';
import { EMERGENCY_POOL_EMPTY_MESSAGE, ITA_ERROR_MAP } from '@bon/types/shaam';

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

type Payload = JobPayloads['shaam-allocation-request'];

// ── helpers ──

function createMockLogger(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as FastifyBaseLogger;
}

function createMockShaamService(): ShaamService {
  return {
    requestAllocationNumber: vi.fn().mockResolvedValue({
      status: 'approved',
      allocationNumber: '123456789',
    }),
  };
}

function createMockJob(retryCount = 0): Job<Payload> {
  return {
    id: 'job-1',
    name: 'shaam-allocation-request',
    data: { businessId: BUSINESS_ID, invoiceId: INVOICE_ID },
    retryCount,
  } as Job<Payload>;
}

function setupMocks() {
  vi.mocked(findInvoiceById).mockResolvedValue(MOCK_INVOICE as never);
  vi.mocked(findItemsByInvoiceId).mockResolvedValue(MOCK_ITEMS as never);
  vi.mocked(findBusinessById).mockResolvedValue(MOCK_BUSINESS as never);
  vi.mocked(findCustomerById).mockResolvedValue(MOCK_CUSTOMER as never);
  vi.mocked(updateInvoice).mockResolvedValue(MOCK_INVOICE as never);
  vi.mocked(insertShaamAuditLog).mockResolvedValue(null);
  vi.mocked(buildItaPayload).mockReturnValue({ mocked: true } as never);
}

describe('shaam-allocation handler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupMocks();
  });

  it('stores allocation number when SHAAM approves', async () => {
    const shaamService = createMockShaamService();
    const logger = createMockLogger();
    const handler = createShaamAllocationHandler(shaamService, logger);

    await handler(createMockJob());

    expect(shaamService.requestAllocationNumber).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: BUSINESS_ID,
        invoiceId: INVOICE_ID,
        documentType: 'tax_invoice',
        items: [
          expect.objectContaining({
            description: 'Service',
            quantity: 1,
            unitPriceMinorUnits: 100_000,
            lineTotalMinorUnits: 100_000,
          }),
        ],
      })
    );
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
        attemptNumber: 1,
      })
    );
  });

  it('stores emergency allocation number when SHAAM returns emergency', async () => {
    const shaamService: ShaamService = {
      requestAllocationNumber: vi.fn().mockResolvedValue({
        status: 'emergency',
        emergencyNumber: 'EMG-1234',
        message: 'Immediate action',
      }),
    };
    const handler = createShaamAllocationHandler(shaamService, createMockLogger());

    await handler(createMockJob());

    expect(updateInvoice).toHaveBeenCalledWith(INVOICE_ID, BUSINESS_ID, {
      allocationStatus: 'emergency',
      allocationNumber: 'EMG-1234',
      allocationError: null,
      updatedAt: expect.any(Date),
    });
    expect(insertShaamAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'emergency',
        allocationNumber: 'EMG-1234',
      })
    );
  });

  it('stores error when SHAAM rejects with unknown code', async () => {
    const shaamService: ShaamService = {
      requestAllocationNumber: vi.fn().mockResolvedValue({
        status: 'rejected',
        errorCode: 'E999',
        errorMessage: 'Unknown error',
      }),
    };
    const handler = createShaamAllocationHandler(shaamService, createMockLogger());

    await handler(createMockJob());

    expect(updateInvoice).toHaveBeenCalledWith(INVOICE_ID, BUSINESS_ID, {
      allocationStatus: 'rejected',
      allocationError: 'E999: Unknown error',
      updatedAt: expect.any(Date),
    });
    expect(insertShaamAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'rejected',
        errorCode: 'E999',
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
    const handler = createShaamAllocationHandler(shaamService, createMockLogger());

    await expect(handler(createMockJob())).rejects.toThrow('SHAAM deferred: System maintenance');
    expect(insertShaamAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: BUSINESS_ID,
        invoiceId: INVOICE_ID,
        result: 'deferred',
        attemptNumber: 1,
      })
    );
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
    const handler = createShaamAllocationHandler(shaamService, createMockLogger());

    await handler(createMockJob());

    expect(shaamService.requestAllocationNumber).not.toHaveBeenCalled();
    expect(updateInvoice).not.toHaveBeenCalled();
  });

  it('skips when invoice not found', async () => {
    vi.mocked(findInvoiceById).mockResolvedValue(null);

    const shaamService = createMockShaamService();
    const handler = createShaamAllocationHandler(shaamService, createMockLogger());

    await handler(createMockJob());

    expect(shaamService.requestAllocationNumber).not.toHaveBeenCalled();
  });

  it('throws on service error to trigger retry and logs audit entry', async () => {
    const shaamService: ShaamService = {
      requestAllocationNumber: vi.fn().mockRejectedValue(new Error('Network timeout')),
    };
    const handler = createShaamAllocationHandler(shaamService, createMockLogger());

    await expect(handler(createMockJob())).rejects.toThrow('Network timeout');
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

  it('uses retrycount from job for attemptNumber', async () => {
    const shaamService = createMockShaamService();
    const handler = createShaamAllocationHandler(shaamService, createMockLogger());

    await handler(createMockJob(2));

    expect(insertShaamAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptNumber: 3,
      })
    );
  });

  // ── T14: error-code-specific handling ──

  it('E099: falls back to emergency pool when available', async () => {
    vi.mocked(consumeNext).mockResolvedValue({
      id: 'emg-1',
      businessId: BUSINESS_ID,
      number: 'EMG-5678',
      used: true,
      usedForInvoiceId: INVOICE_ID,
      usedAt: new Date(),
      reported: false,
      reportedAt: null,
      acquiredAt: new Date(),
    });
    const shaamService: ShaamService = {
      requestAllocationNumber: vi.fn().mockResolvedValue({
        status: 'rejected',
        errorCode: 'E099',
        errorMessage: 'Service unavailable',
      }),
    };
    const handler = createShaamAllocationHandler(shaamService, createMockLogger());

    await handler(createMockJob());

    expect(consumeNext).toHaveBeenCalledWith(BUSINESS_ID, INVOICE_ID);
    expect(updateInvoice).toHaveBeenCalledWith(INVOICE_ID, BUSINESS_ID, {
      allocationStatus: 'emergency',
      allocationNumber: 'EMG-5678',
      allocationError: null,
      updatedAt: expect.any(Date),
    });
  });

  it('E099: stores pool-empty message when no emergency numbers left', async () => {
    vi.mocked(consumeNext).mockResolvedValue(null);
    const shaamService: ShaamService = {
      requestAllocationNumber: vi.fn().mockResolvedValue({
        status: 'rejected',
        errorCode: 'E099',
        errorMessage: 'Service unavailable',
      }),
    };
    const handler = createShaamAllocationHandler(shaamService, createMockLogger());

    await handler(createMockJob());

    expect(updateInvoice).toHaveBeenCalledWith(INVOICE_ID, BUSINESS_ID, {
      allocationStatus: 'rejected',
      allocationError: EMERGENCY_POOL_EMPTY_MESSAGE,
      updatedAt: expect.any(Date),
    });
  });

  it('E010: marks business as needing re-auth', async () => {
    const shaamService: ShaamService = {
      requestAllocationNumber: vi.fn().mockResolvedValue({
        status: 'rejected',
        errorCode: 'E010',
        errorMessage: 'Auth failure',
      }),
    };
    const handler = createShaamAllocationHandler(shaamService, createMockLogger());

    await handler(createMockJob());

    expect(markNeedsReauth).toHaveBeenCalledWith(BUSINESS_ID);
    expect(updateInvoice).toHaveBeenCalledWith(INVOICE_ID, BUSINESS_ID, {
      allocationStatus: 'rejected',
      allocationError: ITA_ERROR_MAP.E010.hebrewMessage,
      updatedAt: expect.any(Date),
    });
  });

  it('E002: treats as idempotent (no invoice update)', async () => {
    const shaamService: ShaamService = {
      requestAllocationNumber: vi.fn().mockResolvedValue({
        status: 'rejected',
        errorCode: 'E002',
        errorMessage: 'Already allocated',
      }),
    };
    const logger = createMockLogger();
    const handler = createShaamAllocationHandler(shaamService, logger);

    await handler(createMockJob());

    expect(logger.info).toHaveBeenCalledWith(
      { invoiceId: INVOICE_ID },
      'SHAAM E002: already allocated, treating as approved'
    );
    // E002 should not update invoice — it's already allocated
    expect(updateInvoice).not.toHaveBeenCalled();
  });

  it('E003: clears allocation status as below threshold', async () => {
    const shaamService: ShaamService = {
      requestAllocationNumber: vi.fn().mockResolvedValue({
        status: 'rejected',
        errorCode: 'E003',
        errorMessage: 'Below threshold',
      }),
    };
    const handler = createShaamAllocationHandler(shaamService, createMockLogger());

    await handler(createMockJob());

    expect(updateInvoice).toHaveBeenCalledWith(INVOICE_ID, BUSINESS_ID, {
      allocationStatus: null,
      allocationError: null,
      updatedAt: expect.any(Date),
    });
  });

  it('E001: stores Hebrew error message from ITA_ERROR_MAP', async () => {
    const shaamService: ShaamService = {
      requestAllocationNumber: vi.fn().mockResolvedValue({
        status: 'rejected',
        errorCode: 'E001',
        errorMessage: 'Invalid data',
      }),
    };
    const handler = createShaamAllocationHandler(shaamService, createMockLogger());

    await handler(createMockJob());

    expect(updateInvoice).toHaveBeenCalledWith(INVOICE_ID, BUSINESS_ID, {
      allocationStatus: 'rejected',
      allocationError: ITA_ERROR_MAP.E001.hebrewMessage,
      updatedAt: expect.any(Date),
    });
  });

  it('enqueues recovery report when approved after emergency status', async () => {
    vi.mocked(findInvoiceById).mockResolvedValue({
      ...MOCK_INVOICE,
      allocationStatus: 'emergency',
    } as never);
    const shaamService = createMockShaamService();
    const mockBoss = { send: vi.fn().mockResolvedValue('job-id') } as never;
    const handler = createShaamAllocationHandler(shaamService, createMockLogger(), mockBoss);

    await handler(createMockJob());

    expect(updateInvoice).toHaveBeenCalledWith(INVOICE_ID, BUSINESS_ID, {
      allocationStatus: 'approved',
      allocationNumber: '123456789',
      allocationError: null,
      updatedAt: expect.any(Date),
    });
  });

  it('logs audit and updates invoice when payload construction throws', async () => {
    vi.mocked(buildItaPayload).mockImplementation(() => {
      throw new Error('payload error');
    });
    const shaamService = createMockShaamService();
    const handler = createShaamAllocationHandler(shaamService, createMockLogger());

    await expect(handler(createMockJob())).rejects.toThrow('payload error');
    expect(shaamService.requestAllocationNumber).not.toHaveBeenCalled();
    expect(insertShaamAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'error',
        responsePayload: null,
      })
    );
    expect(updateInvoice).toHaveBeenCalledWith(INVOICE_ID, BUSINESS_ID, {
      allocationStatus: 'pending',
      allocationError: 'payload error',
      updatedAt: expect.any(Date),
    });
  });
});
