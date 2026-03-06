import { describe, it, expect } from 'vitest';
import { buildItaPayload } from '../../../src/services/shaam/build-ita-payload.js';

const SAMPLE_INVOICE = {
  id: '00000000-0000-0000-0000-000000000001',
  businessId: '00000000-0000-0000-0000-000000000002',
  documentType: 'tax_invoice' as const,
  documentNumber: 'INV-0042',
  invoiceDate: '2026-03-01',
  customerName: 'Test Customer',
  customerTaxId: '123456789',
  totalExclVatMinorUnits: 100_000,
  vatMinorUnits: 17_000,
  totalInclVatMinorUnits: 117_000,
  currency: 'ILS',
};

const SAMPLE_LINE_ITEMS = [
  {
    position: 1,
    description: 'Consulting service',
    quantity: 2,
    unitPriceMinorUnits: 50_000,
    discountPercent: 0,
    vatRateBasisPoints: 1700,
    lineTotalMinorUnits: 100_000,
    vatAmountMinorUnits: 17_000,
    lineTotalInclVatMinorUnits: 117_000,
  },
];

const SAMPLE_BUSINESS = { vatNumber: '987654321' };

describe('buildItaPayload', () => {
  it('maps invoice header fields correctly', () => {
    const payload = buildItaPayload(SAMPLE_INVOICE, SAMPLE_LINE_ITEMS, SAMPLE_BUSINESS);

    expect(payload.InvoiceType).toBe(305);
    expect(payload.VatNumber).toBe('987654321');
    expect(payload.InvoiceNumber).toBe('INV-0042');
    expect(payload.InvoiceDate).toBe('2026-03-01');
    expect(payload.ClientName).toBe('Test Customer');
    expect(payload.ClientVatNumber).toBe('123456789');
    expect(payload.DealAmount).toBe(1000);
    expect(payload.VatAmount).toBe(170);
    expect(payload.TotalAmount).toBe(1170);
    expect(payload.Currency).toBe('ILS');
  });

  it('maps line items with minor-to-major conversion', () => {
    const payload = buildItaPayload(SAMPLE_INVOICE, SAMPLE_LINE_ITEMS, SAMPLE_BUSINESS);

    expect(payload.LineItems).toHaveLength(1);
    const line = payload.LineItems[0]!;
    expect(line.LineNumber).toBe(1);
    expect(line.Description).toBe('Consulting service');
    expect(line.Quantity).toBe(2);
    expect(line.UnitPrice).toBe(500);
    expect(line.Discount).toBe(0);
    expect(line.TotalLineBefore).toBe(1000);
    expect(line.VatRate).toBe(17);
    expect(line.VatAmount).toBe(170);
    expect(line.TotalLineAfter).toBe(1170);
  });

  it('omits ClientVatNumber when customer has no tax ID', () => {
    const invoiceWithoutTaxId = { ...SAMPLE_INVOICE, customerTaxId: null };
    const payload = buildItaPayload(invoiceWithoutTaxId, SAMPLE_LINE_ITEMS, SAMPLE_BUSINESS);

    expect(payload.ClientVatNumber).toBeUndefined();
  });

  it('maps credit note document type to 330', () => {
    const creditNote = { ...SAMPLE_INVOICE, documentType: 'credit_note' as const };
    const payload = buildItaPayload(creditNote, SAMPLE_LINE_ITEMS, SAMPLE_BUSINESS);

    expect(payload.InvoiceType).toBe(330);
  });

  it('maps tax_invoice_receipt to 320 and receipt to 400', () => {
    const receipt = { ...SAMPLE_INVOICE, documentType: 'tax_invoice_receipt' as const };
    expect(buildItaPayload(receipt, SAMPLE_LINE_ITEMS, SAMPLE_BUSINESS).InvoiceType).toBe(320);

    const plainReceipt = { ...SAMPLE_INVOICE, documentType: 'receipt' as const };
    expect(buildItaPayload(plainReceipt, SAMPLE_LINE_ITEMS, SAMPLE_BUSINESS).InvoiceType).toBe(400);
  });

  it('throws for unknown document type', () => {
    const bad = { ...SAMPLE_INVOICE, documentType: 'unknown_type' };
    expect(() => buildItaPayload(bad, SAMPLE_LINE_ITEMS, SAMPLE_BUSINESS)).toThrow(
      'Unknown document type: unknown_type'
    );
  });

  it('handles multiple line items with sequential numbering', () => {
    const items = [
      { ...SAMPLE_LINE_ITEMS[0]!, position: 1 },
      {
        ...SAMPLE_LINE_ITEMS[0]!,
        position: 2,
        description: 'Second item',
        quantity: 1,
        unitPriceMinorUnits: 25_000,
        lineTotalMinorUnits: 25_000,
        vatAmountMinorUnits: 4_250,
        lineTotalInclVatMinorUnits: 29_250,
      },
    ];
    const payload = buildItaPayload(SAMPLE_INVOICE, items, SAMPLE_BUSINESS);

    expect(payload.LineItems).toHaveLength(2);
    expect(payload.LineItems[0]!.LineNumber).toBe(1);
    expect(payload.LineItems[1]!.LineNumber).toBe(2);
    expect(payload.LineItems[1]!.Description).toBe('Second item');
  });
});
