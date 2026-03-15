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

// ── tests ──

describe('pcn874-service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('generates valid PCN874 file with tax_invoice and credit_note', async () => {
    vi.mocked(findBusinessById).mockResolvedValue(makeBusiness() as never);
    vi.mocked(findInvoicesForReport).mockResolvedValue([
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

    const { buffer, filename } = await generatePcn874('biz-1', 2026, 3);
    const content = buffer.toString();
    const lines = content.split('\r\n').filter(Boolean);

    expect(filename).toBe('PCN874_515036694_202603.txt');
    expect(lines).toHaveLength(4);

    // Opening record
    expect(lines[0]).toMatch(/^O/);
    expect(lines[0]).toContain('515036694');
    expect(lines[0]).toMatch(/000000002$/);

    // Tax invoice detail — positive amounts
    expect(lines[1]).toMatch(/^S01/);
    expect(lines[1]).toContain('+00000050000');
    expect(lines[1]).toContain('+008500');

    // Credit note detail — negative amounts
    expect(lines[2]).toMatch(/^S11/);
    expect(lines[2]).toContain('-00000010000');
    expect(lines[2]).toContain('-001700');

    // Closing record
    expect(lines[3]).toBe('X000000002');
  });

  it('generates valid file with zero invoices', async () => {
    vi.mocked(findBusinessById).mockResolvedValue(makeBusiness() as never);
    vi.mocked(findInvoicesForReport).mockResolvedValue([]);

    const { buffer } = await generatePcn874('biz-1', 2026, 3);
    const lines = buffer.toString().split('\r\n').filter(Boolean);

    expect(lines).toHaveLength(2); // opening + closing
    expect(lines[0]).toMatch(/^O/);
    expect(lines[0]).toMatch(/\+00000000000/); // zero taxable amount
    expect(lines[1]).toBe('X000000000');
  });

  it('throws 422 for exempt_dealer business', async () => {
    vi.mocked(findBusinessById).mockResolvedValue(
      makeBusiness({ businessType: 'exempt_dealer' }) as never
    );

    await expect(generatePcn874('biz-1', 2026, 3)).rejects.toThrow(AppError);
    await expect(generatePcn874('biz-1', 2026, 3)).rejects.toMatchObject({
      statusCode: 422,
      code: 'exempt_dealer_no_vat',
    });
  });

  it('handles credit note sign correctly in opening record totals', async () => {
    vi.mocked(findBusinessById).mockResolvedValue(makeBusiness() as never);
    vi.mocked(findInvoicesForReport).mockResolvedValue([
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

    const { buffer } = await generatePcn874('biz-1', 2026, 3);
    const opening = buffer.toString().split('\r\n')[0]!;

    // Net taxable: 50000 - 20000 = 30000, Net VAT: 8500 - 3400 = 5100
    expect(opening).toContain('+00000030000'); // taxable amount
    expect(opening).toContain('+005100'); // taxable VAT
  });

  it('formats allocation number as right 9 digits', async () => {
    vi.mocked(findBusinessById).mockResolvedValue(makeBusiness() as never);
    vi.mocked(findInvoicesForReport).mockResolvedValue([
      makeInvoice({
        allocationStatus: 'approved',
        allocationNumber: '12345678901234',
      }),
    ]);

    const { buffer } = await generatePcn874('biz-1', 2026, 3);
    const detail = buffer.toString().split('\r\n')[1]!;

    // Right 9 digits of '12345678901234' = '678901234'
    expect(detail).toContain('678901234');
  });

  it('uses zeros for allocation when status is not approved/emergency', async () => {
    vi.mocked(findBusinessById).mockResolvedValue(makeBusiness() as never);
    vi.mocked(findInvoicesForReport).mockResolvedValue([
      makeInvoice({
        allocationStatus: 'pending',
        allocationNumber: '12345678901234',
      }),
    ]);

    const { buffer } = await generatePcn874('biz-1', 2026, 3);
    const detail = buffer.toString().split('\r\n')[1]!;

    expect(detail).toContain('000000000');
  });

  it('puts zero-VAT invoices into exempt totals', async () => {
    vi.mocked(findBusinessById).mockResolvedValue(makeBusiness() as never);
    vi.mocked(findInvoicesForReport).mockResolvedValue([
      makeInvoice({
        totalExclVatMinorUnits: 30000,
        vatMinorUnits: 0,
        totalInclVatMinorUnits: 30000,
      }),
    ]);

    const { buffer } = await generatePcn874('biz-1', 2026, 3);
    const opening = buffer.toString().split('\r\n')[0]!;

    // Taxable should be zero, exempt should be 30000
    expect(opening).toContain('+00000000000+000000000+00000030000');
  });

  it('throws 404 when business is not found', async () => {
    vi.mocked(findBusinessById).mockResolvedValue(null as never);

    await expect(generatePcn874('non-existent', 2026, 3)).rejects.toThrow(AppError);
    await expect(generatePcn874('non-existent', 2026, 3)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('falls back to registrationNumber when vatNumber is null', async () => {
    vi.mocked(findBusinessById).mockResolvedValue(
      makeBusiness({ vatNumber: null, registrationNumber: '987654321' }) as never
    );
    vi.mocked(findInvoicesForReport).mockResolvedValue([]);

    const { filename } = await generatePcn874('biz-1', 2026, 3);

    expect(filename).toContain('987654321');
  });
});
