import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/app-error.js';
import { generatePcn874 } from '../../src/services/pcn874-service.js';
import type { InvoiceRecord } from '../../src/repositories/invoice-repository.js';

vi.mock('../../src/repositories/business-repository.js');
vi.mock('../../src/repositories/invoice-repository.js');

const { findBusinessById } = await import('../../src/repositories/business-repository.js');
const { findInvoicesForReport } = await import('../../src/repositories/invoice-repository.js');

// ── helpers ──

function makeBusiness(overrides: Record<string, unknown> = {}) {
  return {
    id: 'biz-1',
    name: 'Test Business',
    businessType: 'licensed_dealer',
    registrationNumber: '515036694',
    vatNumber: null,
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id: 'inv-1',
    businessId: 'biz-1',
    documentType: 'tax_invoice',
    status: 'finalized',
    invoiceDate: '2026-03-15',
    sequenceNumber: 1,
    sequenceGroup: 'tax_document',
    documentNumber: 'INV-0001',
    customerName: 'Test Customer',
    customerTaxId: '123456789',
    totalExclVatMinorUnits: 10000,
    vatMinorUnits: 1700,
    totalInclVatMinorUnits: 11700,
    allocationStatus: null,
    allocationNumber: null,
    customerId: null,
    currency: 'ILS',
    dueDate: null,
    notes: null,
    issuedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    isOverdue: false,
    creditedInvoiceId: null,
    ...overrides,
  } as InvoiceRecord;
}

function setupMocks(invoices: InvoiceRecord[], businessOverrides?: Record<string, unknown>) {
  vi.mocked(findBusinessById).mockResolvedValue(makeBusiness(businessOverrides) as never);
  vi.mocked(findInvoicesForReport).mockResolvedValue(invoices);
}

async function generateAndParseLines(bizId = 'biz-1', year = 2026, month = 3) {
  const result = await generatePcn874(bizId, year, month);
  const lines = result.buffer.toString().split('\r\n').filter(Boolean);
  return { ...result, lines };
}

// ── tests ──

describe('pcn874-service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('generates valid PCN874 file with tax_invoice and credit_note', async () => {
    setupMocks([
      makeInvoice({
        id: 'inv-1',
        documentType: 'tax_invoice',
        totalExclVatMinorUnits: 50000,
        vatMinorUnits: 8500,
        totalInclVatMinorUnits: 58500,
        customerTaxId: '515036694',
        sequenceNumber: 1,
      }),
      makeInvoice({
        id: 'inv-2',
        documentType: 'credit_note',
        totalExclVatMinorUnits: 10000,
        vatMinorUnits: 1700,
        totalInclVatMinorUnits: 11700,
        customerTaxId: '515036694',
        sequenceNumber: 1,
        invoiceDate: '2026-03-20',
      }),
    ]);

    const { filename, lines } = await generateAndParseLines();

    expect(filename).toBe('PCN874_515036694_202603.txt');
    expect(lines).toHaveLength(4);

    // Opening record
    expect(lines[0]).toMatch(/^O/);
    expect(lines[0]).toContain('515036694');
    expect(lines[0]).toMatch(/000000002$/);

    // Tax invoice detail — positive amounts
    expect(lines[1]).toMatch(/^S01/);
    expect(lines[1]).toContain('+00000050000');
    expect(lines[1]).toContain('+000008500');

    // Credit note detail — negative amounts
    expect(lines[2]).toMatch(/^S11/);
    expect(lines[2]).toContain('-00000010000');
    expect(lines[2]).toContain('-000001700');

    // Closing record
    expect(lines[3]).toBe('X000000002');
  });

  it('generates valid file with zero invoices', async () => {
    setupMocks([]);

    const { lines } = await generateAndParseLines();

    expect(lines).toHaveLength(2); // opening + closing
    expect(lines[0]).toMatch(/^O/);
    expect(lines[0]).toMatch(/\+00000000000/); // zero taxable amount
    expect(lines[1]).toBe('X000000000');
  });

  it('throws 422 when invoice has null sequenceNumber', async () => {
    setupMocks([makeInvoice({ sequenceNumber: null as unknown as number })]);

    await expect(generatePcn874('biz-1', 2026, 3)).rejects.toThrow(AppError);
    await expect(generatePcn874('biz-1', 2026, 3)).rejects.toMatchObject({
      statusCode: 422,
      code: 'missing_sequence_number',
    });
  });

  it('throws 422 for exempt_dealer business', async () => {
    setupMocks([], { businessType: 'exempt_dealer' });

    await expect(generatePcn874('biz-1', 2026, 3)).rejects.toThrow(AppError);
    await expect(generatePcn874('biz-1', 2026, 3)).rejects.toMatchObject({
      statusCode: 422,
      code: 'exempt_dealer_no_vat',
    });
  });

  it('handles credit note sign correctly in opening record totals', async () => {
    setupMocks([
      makeInvoice({
        documentType: 'tax_invoice',
        totalExclVatMinorUnits: 50000,
        vatMinorUnits: 8500,
      }),
      makeInvoice({
        id: 'inv-2',
        documentType: 'credit_note',
        totalExclVatMinorUnits: 20000,
        vatMinorUnits: 3400,
      }),
    ]);

    const { lines } = await generateAndParseLines();

    // Net taxable: 50000 - 20000 = 30000, Net VAT: 8500 - 3400 = 5100
    expect(lines[0]).toContain('+00000030000'); // taxable amount
    expect(lines[0]).toContain('+000005100'); // taxable VAT
  });

  it('formats allocation number as right 9 digits', async () => {
    setupMocks([
      makeInvoice({
        allocationStatus: 'approved',
        allocationNumber: '12345678901234',
      }),
    ]);

    const { lines } = await generateAndParseLines();

    // Right 9 digits of '12345678901234' = '678901234'
    expect(lines[1]).toContain('678901234');
  });

  it('uses zeros for allocation when status is not approved/emergency', async () => {
    setupMocks([
      makeInvoice({
        allocationStatus: 'pending',
        allocationNumber: '12345678901234',
      }),
    ]);

    const { lines } = await generateAndParseLines();

    expect(lines[1]).toContain('000000000');
  });

  it('puts zero-VAT invoices into exempt totals', async () => {
    setupMocks([
      makeInvoice({
        totalExclVatMinorUnits: 30000,
        vatMinorUnits: 0,
        totalInclVatMinorUnits: 30000,
      }),
    ]);

    const { lines } = await generateAndParseLines();

    // Taxable should be zero, exempt should be 30000
    expect(lines[0]).toContain('+00000000000+000000000+00000030000');
  });

  it('throws 404 when business is not found', async () => {
    vi.mocked(findBusinessById).mockResolvedValue(null as never);

    await expect(generatePcn874('non-existent', 2026, 3)).rejects.toThrow(AppError);
    await expect(generatePcn874('non-existent', 2026, 3)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('falls back to registrationNumber when vatNumber is null', async () => {
    setupMocks([], { vatNumber: null, registrationNumber: '987654321' });

    const { filename } = await generateAndParseLines();

    expect(filename).toContain('987654321');
  });

  it('strips non-digit characters from vatNumber', async () => {
    setupMocks([], { vatNumber: '51-503-6694', registrationNumber: '000000000' });

    const { filename, lines } = await generateAndParseLines();

    expect(filename).toBe('PCN874_515036694_202603.txt');
    expect(lines[0]).toContain('515036694');
  });
});
