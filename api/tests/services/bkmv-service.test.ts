import * as iconv from 'iconv-lite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/app-error.js';
import { generateBkmvExport } from '../../src/services/bkmv-service.js';
import type { InvoiceRecord, InvoiceItemRecord } from '../../src/repositories/invoice-repository.js';
import type { PaymentRecord } from '../../src/repositories/payment-repository.js';

vi.mock('../../src/repositories/business-repository.js');
vi.mock('../../src/repositories/invoice-repository.js');
vi.mock('../../src/repositories/payment-repository.js');

const { findBusinessById } = await import('../../src/repositories/business-repository.js');
const { findInvoicesForReport, findItemsByInvoiceIds } = await import(
  '../../src/repositories/invoice-repository.js'
);
const { findPaymentsByInvoiceIds } = await import(
  '../../src/repositories/payment-repository.js'
);

// ── helpers ──

function makeBusiness(overrides: Record<string, unknown> = {}) {
  return {
    id: 'biz-1',
    name: 'Test Business',
    registrationNumber: '515036694',
    businessType: 'licensed_dealer',
    streetAddress: '5 Dizengoff St',
    city: 'Tel Aviv',
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
    invoiceDate: '2025-06-15',
    sequenceNumber: 1,
    sequenceGroup: 'tax_document',
    documentNumber: 'INV-0001',
    customerName: 'Test Customer Ltd',
    customerTaxId: '123456789',
    customerAddress: '10 Herzl St, Haifa',
    currency: 'ILS',
    subtotalMinorUnits: 10000,
    discountMinorUnits: 0,
    totalExclVatMinorUnits: 10000,
    vatMinorUnits: 1700,
    totalInclVatMinorUnits: 11700,
    allocationStatus: null,
    allocationNumber: null,
    customerId: null,
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

function makeItem(overrides: Partial<InvoiceItemRecord> = {}): InvoiceItemRecord {
  return {
    id: 'item-1',
    invoiceId: 'inv-1',
    position: 1,
    description: 'Consulting services',
    catalogNumber: null,
    quantity: '2.0000',
    unitPriceMinorUnits: 5000,
    discountPercent: '10.00',
    vatRateBasisPoints: 1700,
    lineTotalMinorUnits: 9000,
    vatAmountMinorUnits: 1530,
    lineTotalInclVatMinorUnits: 10530,
    ...overrides,
  } as InvoiceItemRecord;
}

function makePayment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: 'pay-1',
    invoiceId: 'inv-1',
    amountMinorUnits: 11700,
    paidAt: '2025-06-20',
    method: 'transfer',
    reference: 'TRF-001',
    notes: null,
    recordedByUserId: 'user-1',
    createdAt: new Date(),
    ...overrides,
  } as PaymentRecord;
}

function setupMocks(
  invoiceList: InvoiceRecord[],
  items: InvoiceItemRecord[] = [],
  payments: PaymentRecord[] = [],
  businessOverrides?: Record<string, unknown>
) {
  vi.mocked(findBusinessById).mockResolvedValue(makeBusiness(businessOverrides) as never);
  vi.mocked(findInvoicesForReport).mockResolvedValue(invoiceList);
  vi.mocked(findItemsByInvoiceIds).mockResolvedValue(items);
  vi.mocked(findPaymentsByInvoiceIds).mockResolvedValue(payments);
}

function decodeBkmvLines(result: { bkmvdataBuffer: Buffer }): string[] {
  return iconv.decode(result.bkmvdataBuffer, 'windows-1255').split('\r\n').filter(Boolean);
}

// ── tests ──

describe('bkmv-service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('generateBkmvExport', () => {
    it('throws 404 when business not found', async () => {
      vi.mocked(findBusinessById).mockResolvedValue(null as never);

      await expect(generateBkmvExport('non-existent', 2025)).rejects.toThrow(AppError);
      await expect(generateBkmvExport('non-existent', 2025)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('throws badRequest when no finalized invoices exist', async () => {
      setupMocks([]);

      await expect(generateBkmvExport('biz-1', 2025)).rejects.toThrow(AppError);
      await expect(generateBkmvExport('biz-1', 2025)).rejects.toMatchObject({
        code: 'no_data',
      });
    });

    it('returns Windows-1255 encoded buffers', async () => {
      const invoice = makeInvoice();
      const item = makeItem();
      const payment = makePayment();
      setupMocks([invoice], [item], [payment]);

      const result = await generateBkmvExport('biz-1', 2025);

      expect(Buffer.isBuffer(result.iniBuffer)).toBe(true);
      expect(Buffer.isBuffer(result.bkmvdataBuffer)).toBe(true);
      expect(Buffer.isBuffer(result.readmeBuffer)).toBe(true);

      // Verify we can decode from Windows-1255
      const ini = iconv.decode(result.iniBuffer, 'windows-1255');
      expect(ini).toContain('515036694');
    });

    it('generates correct filename', async () => {
      setupMocks([makeInvoice()], [makeItem()], [makePayment()]);

      const result = await generateBkmvExport('biz-1', 2025);

      expect(result.filename).toBe('BKMV_515036694_2025.zip');
    });
  });

  describe('A100 record', () => {
    it('includes A100 as the first line with business info', async () => {
      setupMocks([makeInvoice()], [makeItem()], [makePayment()]);

      const result = await generateBkmvExport('biz-1', 2025);
      const lines = decodeBkmvLines(result);

      const a100 = lines[0]!;
      const fields = a100.split('|');
      expect(fields[0]).toBe('A100');
      expect(fields[1]).toContain('515036694');
      expect(fields[2]).toContain('Test Business');
      expect(fields[5]).toBe('20250101');
      expect(fields[6]).toBe('20251231');
      expect(fields[7]).toContain('BON');
    });
  });

  describe('C100 record', () => {
    it('formats invoice header with correct field widths and delimiters', async () => {
      const invoice = makeInvoice({
        documentType: 'tax_invoice',
        documentNumber: 'INV-0001',
        invoiceDate: '2025-06-15',
        customerName: 'Test Customer Ltd',
        customerTaxId: '123456789',
        totalExclVatMinorUnits: 10000,
        vatMinorUnits: 1700,
        totalInclVatMinorUnits: 11700,
      });
      setupMocks([invoice], [makeItem()], [makePayment()]);

      const result = await generateBkmvExport('biz-1', 2025);
      const lines = decodeBkmvLines(result);

      // C100 is after A100
      const c100 = lines[1]!;
      const fields = c100.split('|');

      expect(fields[0]).toBe('C100');
      // Subsection code for tax_invoice = 305
      expect(fields[1]).toBe('305');
      // Running number, 9 chars padded
      expect(fields[2]).toBe('000000001');
      // Document number, 20 chars padded
      expect(fields[3]).toContain('INV-0001');
      expect(fields[3]!.length).toBe(20);
      // Date formatted as YYYYMMDD
      expect(fields[4]).toBe('20250615');
      // Customer name, 50 chars
      expect(fields[6]).toContain('Test Customer Ltd');
      expect(fields[6]!.length).toBe(50);
      // Customer tax ID, 9 chars padded
      expect(fields[10]).toBe('123456789');
      // Amounts, 15 chars each
      expect(fields[13]).toBe('000000000010000'); // totalExclVat
      expect(fields[14]).toBe('000000000001700'); // vat
      expect(fields[15]).toBe('000000000011700'); // totalInclVat
    });

    it('maps credit_note to subsection 330', async () => {
      const invoice = makeInvoice({ documentType: 'credit_note' });
      setupMocks([invoice], [makeItem()], [makePayment()]);

      const result = await generateBkmvExport('biz-1', 2025);
      const lines = decodeBkmvLines(result);
      const c100 = lines[1]!;
      const fields = c100.split('|');

      expect(fields[1]).toBe('330');
    });
  });

  describe('D110 record', () => {
    it('formats line item with quantity, discount, and amounts', async () => {
      const item = makeItem({
        position: 1,
        description: 'Consulting services',
        quantity: '2.0000',
        unitPriceMinorUnits: 5000,
        discountPercent: '10.00',
        vatRateBasisPoints: 1700,
        lineTotalMinorUnits: 9000,
        vatAmountMinorUnits: 1530,
      });
      setupMocks([makeInvoice()], [item], [makePayment()]);

      const result = await generateBkmvExport('biz-1', 2025);
      const lines = decodeBkmvLines(result);

      // D110 is after A100 and C100
      const d110 = lines[2]!;
      const fields = d110.split('|');

      expect(fields[0]).toBe('D110');
      // Subsection matches parent invoice (305 for tax_invoice)
      expect(fields[1]).toBe('305');
      // Running number matches parent C100
      expect(fields[2]).toBe('000000001');
      // Position, 4 chars
      expect(fields[3]).toBe('0001');
      // Description, 50 chars
      expect(fields[5]).toContain('Consulting services');
      expect(fields[5]!.length).toBe(50);
      // Quantity: 2.0000, 12 chars
      expect(fields[7]).toBe('0000002.0000');
      // Unit price: 5000, 15 chars
      expect(fields[8]).toBe('000000000005000');
      // Discount percent: 10.00, 6 chars
      expect(fields[9]).toBe('010.00');
      // Discount amount: 2 * 5000 * 10% = 1000, 15 chars
      expect(fields[10]).toBe('000000000001000');
      // Line total: 9000
      expect(fields[11]).toBe('000000000009000');
      // VAT rate: 17.00, 6 chars
      expect(fields[12]).toBe('017.00');
      // VAT amount: 1530
      expect(fields[13]).toBe('000000000001530');
    });
  });

  describe('D120 record', () => {
    it('formats payment with method code and amount', async () => {
      const payment = makePayment({
        method: 'transfer',
        paidAt: '2025-06-20',
        amountMinorUnits: 11700,
        reference: 'TRF-001',
      });
      setupMocks([makeInvoice()], [makeItem()], [payment]);

      const result = await generateBkmvExport('biz-1', 2025);
      const lines = decodeBkmvLines(result);

      // D120 comes after A100, C100, D110
      const d120 = lines[3]!;
      const fields = d120.split('|');

      expect(fields[0]).toBe('D120');
      // Method code: transfer = 4
      expect(fields[3]).toBe('04');
      // Reference, 15 chars
      expect(fields[7]).toContain('TRF-001');
      // Date
      expect(fields[8]).toBe('20250620');
      // Amount, 15 chars
      expect(fields[9]).toBe('000000000011700');
    });

    it('maps cash payment to method code 1', async () => {
      const payment = makePayment({ method: 'cash' });
      setupMocks([makeInvoice()], [makeItem()], [payment]);

      const result = await generateBkmvExport('biz-1', 2025);
      const lines = decodeBkmvLines(result);
      const d120 = lines[3]!;
      const fields = d120.split('|');

      expect(fields[3]).toBe('01');
    });
  });

  describe('Z900 footer records', () => {
    it('includes correct counts for A100, C100, D110, D120', async () => {
      const inv1 = makeInvoice({ id: 'inv-1' });
      const inv2 = makeInvoice({ id: 'inv-2', documentNumber: 'INV-0002' });
      const items = [
        makeItem({ id: 'item-1', invoiceId: 'inv-1', position: 1 }),
        makeItem({ id: 'item-2', invoiceId: 'inv-1', position: 2 }),
        makeItem({ id: 'item-3', invoiceId: 'inv-2', position: 1 }),
      ];
      const payments = [
        makePayment({ id: 'pay-1', invoiceId: 'inv-1' }),
        makePayment({ id: 'pay-2', invoiceId: 'inv-2' }),
      ];
      setupMocks([inv1, inv2], items, payments);

      const result = await generateBkmvExport('biz-1', 2025);
      const lines = decodeBkmvLines(result);

      const z900Lines = lines.filter((l) => l.startsWith('Z900'));
      expect(z900Lines).toHaveLength(4);
      expect(z900Lines[0]).toBe('Z900|A100|000000001');
      expect(z900Lines[1]).toBe('Z900|C100|000000002');
      expect(z900Lines[2]).toBe('Z900|D110|000000003');
      expect(z900Lines[3]).toBe('Z900|D120|000000002');
    });
  });

  describe('INI.TXT content', () => {
    it('includes business info and record counts', async () => {
      setupMocks([makeInvoice()], [makeItem()], [makePayment()]);

      const result = await generateBkmvExport('biz-1', 2025);
      const ini = iconv.decode(result.iniBuffer, 'windows-1255');
      const lines = ini.split('\r\n').filter(Boolean);

      expect(lines.some((l) => l.startsWith('1000|515036694'))).toBe(true);
      expect(lines.some((l) => l.startsWith('1001|Test Business'))).toBe(true);
      expect(lines.some((l) => l.startsWith('1004|20250101'))).toBe(true);
      expect(lines.some((l) => l.startsWith('1005|20251231'))).toBe(true);
      // Counts: 1 C100, 1 D110, 1 D120
      expect(lines.some((l) => l === '1010|1')).toBe(true);
      expect(lines.some((l) => l === '1011|1')).toBe(true);
      expect(lines.some((l) => l === '1012|1')).toBe(true);
    });
  });
});
