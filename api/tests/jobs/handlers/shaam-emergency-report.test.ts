import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'pg-boss';
import type { FastifyBaseLogger } from 'fastify';
import { createShaamEmergencyReportHandler } from '../../../src/jobs/handlers/shaam-emergency-report.js';
import type { ShaamService } from '../../../src/services/shaam/types.js';
import type { JobPayloads } from '../../../src/jobs/boss.js';

// Mock repositories
vi.mock('../../../src/repositories/emergency-allocation-repository.js', () => ({
  findUnreportedUsed: vi.fn(),
  markReported: vi.fn(),
}));

import {
  findUnreportedUsed,
  markReported,
} from '../../../src/repositories/emergency-allocation-repository.js';

const BUSINESS_ID = '00000000-0000-0000-0000-000000000001';

type Payload = JobPayloads['shaam-emergency-report'];

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
    requestAllocationNumber: vi.fn(),
    reportEmergencyUsage: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockJob(): Job<Payload> {
  return {
    id: 'job-1',
    name: 'shaam-emergency-report',
    data: { businessId: BUSINESS_ID },
  } as Job<Payload>;
}

describe('shaam-emergency-report handler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('skips when no unreported numbers exist', async () => {
    vi.mocked(findUnreportedUsed).mockResolvedValue([]);
    const shaamService = createMockShaamService();
    const handler = createShaamEmergencyReportHandler(shaamService, createMockLogger());

    await handler(createMockJob());

    expect(shaamService.reportEmergencyUsage).not.toHaveBeenCalled();
    expect(markReported).not.toHaveBeenCalled();
  });

  it('reports unreported numbers and marks them', async () => {
    vi.mocked(findUnreportedUsed).mockResolvedValue([
      {
        id: 'num-1',
        businessId: BUSINESS_ID,
        number: 'EMG-001',
        used: true,
        usedForInvoiceId: 'inv-1',
        usedAt: new Date(),
        reported: false,
        reportedAt: null,
        acquiredAt: new Date(),
      },
      {
        id: 'num-2',
        businessId: BUSINESS_ID,
        number: 'EMG-002',
        used: true,
        usedForInvoiceId: 'inv-2',
        usedAt: new Date(),
        reported: false,
        reportedAt: null,
        acquiredAt: new Date(),
      },
    ]);
    vi.mocked(markReported).mockResolvedValue(undefined);

    const shaamService = createMockShaamService();
    const handler = createShaamEmergencyReportHandler(shaamService, createMockLogger());

    await handler(createMockJob());

    expect(shaamService.reportEmergencyUsage).toHaveBeenCalledWith(BUSINESS_ID, [
      { number: 'EMG-001', invoiceId: 'inv-1' },
      { number: 'EMG-002', invoiceId: 'inv-2' },
    ]);
    expect(markReported).toHaveBeenCalledWith(['num-1', 'num-2']);
  });

  it('warns when service does not implement reportEmergencyUsage', async () => {
    vi.mocked(findUnreportedUsed).mockResolvedValue([
      {
        id: 'num-1',
        businessId: BUSINESS_ID,
        number: 'EMG-001',
        used: true,
        usedForInvoiceId: 'inv-1',
        usedAt: new Date(),
        reported: false,
        reportedAt: null,
        acquiredAt: new Date(),
      },
    ]);
    vi.mocked(markReported).mockResolvedValue(undefined);

    const shaamService: ShaamService = {
      requestAllocationNumber: vi.fn(),
    };
    const logger = createMockLogger();
    const handler = createShaamEmergencyReportHandler(shaamService, logger);

    await handler(createMockJob());

    expect(logger.warn).toHaveBeenCalledWith(
      { businessId: BUSINESS_ID },
      'SHAAM service does not implement reportEmergencyUsage'
    );
    expect(markReported).toHaveBeenCalledWith(['num-1']);
  });
});
