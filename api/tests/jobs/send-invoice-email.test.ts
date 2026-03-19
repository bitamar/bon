import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Job, JobWithMetadata } from 'pg-boss';
import type { JobPayloads } from '../../src/jobs/boss.js';
import type { FastifyBaseLogger } from 'fastify';
import { createSendInvoiceEmailHandler } from '../../src/jobs/handlers/send-invoice-email.js';

type EmailPayload = JobPayloads['send-invoice-email'];

// ── mocks ──

const mockFindInvoiceById = vi.fn();
const mockFindBusinessById = vi.fn();
const mockUpdateInvoice = vi.fn();
const mockGenerateInvoicePdf = vi.fn();
const mockEmailSend = vi.fn();

vi.mock('../../src/repositories/invoice-repository.js', () => ({
  findInvoiceById: (...args: unknown[]) => mockFindInvoiceById(...args),
  updateInvoice: (...args: unknown[]) => mockUpdateInvoice(...args),
}));

vi.mock('../../src/repositories/business-repository.js', () => ({
  findBusinessById: (...args: unknown[]) => mockFindBusinessById(...args),
}));

vi.mock('../../src/services/pdf-service.js', () => ({
  generateInvoicePdf: (...args: unknown[]) => mockGenerateInvoicePdf(...args),
}));

vi.mock('../../src/services/email-service.js', () => ({
  emailService: { send: (...args: unknown[]) => mockEmailSend(...args) },
  buildInvoiceEmailSubject: () => 'Test Subject',
  buildInvoiceEmailHtml: () => '<p>Test</p>',
}));

vi.mock('../../src/lib/invoice-serializers.js', () => ({
  serializeInvoice: (inv: unknown) => inv,
}));

const logger: FastifyBaseLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(),
  level: 'info',
  silent: vi.fn(),
} as unknown as FastifyBaseLogger;

// ── helpers ──

function makeJob(overrides: Partial<JobWithMetadata<EmailPayload>> = {}): Job<EmailPayload> {
  return {
    id: 'job-1',
    name: 'send-invoice-email',
    data: {
      invoiceId: 'inv-1',
      businessId: 'biz-1',
      recipientEmail: 'test@example.com',
    },
    retryCount: 0,
    retryLimit: 3,
    ...overrides,
  } as unknown as Job<EmailPayload>;
}

function makeInvoice(status = 'sending') {
  return {
    id: 'inv-1',
    businessId: 'biz-1',
    status,
    documentType: 'tax_invoice',
    documentNumber: 'INV-001',
    customerName: 'Test Customer',
    customerTaxId: null,
    totalInclVatMinorUnits: 11700,
  };
}

describe('send-invoice-email handler', () => {
  const handler = createSendInvoiceEmailHandler(logger);

  beforeEach(() => {
    vi.resetAllMocks();
    mockFindBusinessById.mockResolvedValue({ id: 'biz-1', name: 'Test Biz' });
    mockGenerateInvoicePdf.mockResolvedValue({
      pdf: Buffer.from('fake-pdf'),
      filename: 'INV-001.pdf',
    });
    mockEmailSend.mockResolvedValue(undefined);
    mockUpdateInvoice.mockResolvedValue(makeInvoice('sent'));
  });

  it('sends email and updates status to sent on success', async () => {
    mockFindInvoiceById.mockResolvedValue(makeInvoice('sending'));

    await handler(makeJob());

    expect(mockEmailSend).toHaveBeenCalledOnce();
    expect(mockEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'test@example.com',
        subject: 'Test Subject',
        attachments: [expect.objectContaining({ filename: 'INV-001.pdf' })],
      })
    );
    expect(mockUpdateInvoice).toHaveBeenCalledWith(
      'inv-1',
      'biz-1',
      expect.objectContaining({ status: 'sent' })
    );
  });

  it('skips when invoice not found', async () => {
    mockFindInvoiceById.mockResolvedValue(null);

    await handler(makeJob());

    expect(mockEmailSend).not.toHaveBeenCalled();
    expect(mockUpdateInvoice).not.toHaveBeenCalled();
  });

  it('skips when invoice is no longer in sending state', async () => {
    mockFindInvoiceById.mockResolvedValue(makeInvoice('sent'));

    await handler(makeJob());

    expect(mockEmailSend).not.toHaveBeenCalled();
  });

  it('throws on email failure to trigger pg-boss retry', async () => {
    mockFindInvoiceById.mockResolvedValue(makeInvoice('sending'));
    mockEmailSend.mockRejectedValue(new Error('SMTP error'));

    await expect(handler(makeJob())).rejects.toThrow('SMTP error');
  });

  it('reverts to finalized on last retry', async () => {
    mockFindInvoiceById.mockResolvedValue(makeInvoice('sending'));
    mockEmailSend.mockRejectedValue(new Error('SMTP error'));

    // retryCount > retryLimit means this is the last attempt
    const job = makeJob({ retryCount: 4, retryLimit: 3 } as Partial<JobWithMetadata<EmailPayload>>);

    await expect(handler(job)).rejects.toThrow('SMTP error');

    expect(mockUpdateInvoice).toHaveBeenCalledWith(
      'inv-1',
      'biz-1',
      expect.objectContaining({ status: 'finalized' })
    );
  });
});
