import { describe, it, expect } from 'vitest';
import { renderInvoiceHtml } from '../../src/pdf/render-html.js';
import type { PdfRenderInput } from '@bon/types/pdf';

function makeBusiness(): PdfRenderInput['business'] {
  return {
    name: '\u05D7\u05D1\u05E8\u05EA \u05D1\u05D3\u05D9\u05E7\u05D4',
    businessType: 'licensed_dealer',
    registrationNumber: '123456789',
    vatNumber: '987654321',
    streetAddress: '\u05E8\u05D5\u05D8\u05E9\u05D9\u05DC\u05D3 1',
    city: '\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1',
    postalCode: '6688101',
    phone: '0501234567',
    email: 'test@example.com',
    logoUrl: null,
  };
}

function makeInvoice(
  overrides: Partial<PdfRenderInput['invoice']> = {}
): PdfRenderInput['invoice'] {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    businessId: '00000000-0000-0000-0000-000000000002',
    customerId: '00000000-0000-0000-0000-000000000003',
    customerName: '\u05DC\u05E7\u05D5\u05D7 \u05D8\u05E1\u05D8',
    customerTaxId: '111111111',
    customerAddress: '\u05D4\u05E8\u05E6\u05DC 10, \u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD',
    customerEmail: 'customer@example.com',
    documentType: 'tax_invoice',
    status: 'finalized',
    isOverdue: false,
    sequenceGroup: 'tax_document',
    sequenceNumber: 42,
    documentNumber: 'INV-0042',
    creditedInvoiceId: null,
    invoiceDate: '2026-03-01',
    issuedAt: '2026-03-01T10:00:00.000Z',
    dueDate: '2026-03-31',
    notes: '\u05D4\u05E2\u05E8\u05D4 \u05DC\u05D3\u05D5\u05D2\u05DE\u05D4',
    internalNotes: null,
    currency: 'ILS',
    vatExemptionReason: null,
    subtotalMinorUnits: 10000,
    discountMinorUnits: 0,
    totalExclVatMinorUnits: 10000,
    vatMinorUnits: 1700,
    totalInclVatMinorUnits: 11700,
    allocationStatus: null,
    allocationNumber: null,
    allocationError: null,
    sentAt: null,
    paidAt: null,
    createdAt: '2026-03-01T09:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
    ...overrides,
  };
}

function makeItem(
  overrides: Partial<PdfRenderInput['items'][number]> = {}
): PdfRenderInput['items'][number] {
  return {
    id: '00000000-0000-0000-0000-000000000010',
    invoiceId: '00000000-0000-0000-0000-000000000001',
    position: 0,
    description: '\u05E9\u05D9\u05E8\u05D5\u05EA \u05D9\u05D9\u05E2\u05D5\u05E5',
    catalogNumber: null,
    quantity: 1,
    unitPriceMinorUnits: 10000,
    discountPercent: 0,
    vatRateBasisPoints: 1700,
    lineTotalMinorUnits: 10000,
    vatAmountMinorUnits: 1700,
    lineTotalInclVatMinorUnits: 11700,
    ...overrides,
  };
}

function makeInput(overrides: Partial<PdfRenderInput> = {}): PdfRenderInput {
  return {
    business: makeBusiness(),
    invoice: makeInvoice(),
    items: [makeItem()],
    isDraft: false,
    ...overrides,
  };
}

describe('renderInvoiceHtml', () => {
  it('renders valid HTML with DOCTYPE', () => {
    const html = renderInvoiceHtml(makeInput());
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<html dir="rtl" lang="he">');
  });

  it('includes business name and registration number', () => {
    const html = renderInvoiceHtml(makeInput());
    expect(html).toContain('\u05D7\u05D1\u05E8\u05EA \u05D1\u05D3\u05D9\u05E7\u05D4');
    expect(html).toContain('123456789');
  });

  it('includes document type label and number', () => {
    const html = renderInvoiceHtml(makeInput());
    expect(html).toContain('\u05D7\u05E9\u05D1\u05D5\u05E0\u05D9\u05EA \u05DE\u05E1');
    expect(html).toContain('INV-0042');
  });

  it('includes customer details', () => {
    const html = renderInvoiceHtml(makeInput());
    expect(html).toContain('\u05DC\u05E7\u05D5\u05D7 \u05D8\u05E1\u05D8');
    expect(html).toContain('111111111');
    expect(html).toContain('customer@example.com');
  });

  it('includes line item description', () => {
    const html = renderInvoiceHtml(makeInput());
    expect(html).toContain('\u05E9\u05D9\u05E8\u05D5\u05EA \u05D9\u05D9\u05E2\u05D5\u05E5');
  });

  it('includes formatted totals', () => {
    const html = renderInvoiceHtml(makeInput());
    // The totals should be formatted as currency
    expect(html).toContain('\u05E1\u05D4&quot;\u05DB \u05DC\u05EA\u05E9\u05DC\u05D5\u05DD');
  });

  it('includes notes when present', () => {
    const html = renderInvoiceHtml(makeInput());
    expect(html).toContain('\u05D4\u05E2\u05E8\u05D4 \u05DC\u05D3\u05D5\u05D2\u05DE\u05D4');
  });

  it('shows draft watermark when isDraft is true', () => {
    const html = renderInvoiceHtml(makeInput({ isDraft: true }));
    expect(html).toContain('\u05D8\u05D9\u05D5\u05D8\u05D4');
    expect(html).toContain('class="watermark"');
  });

  it('does not show watermark element when isDraft is false', () => {
    const html = renderInvoiceHtml(makeInput({ isDraft: false }));
    expect(html).not.toContain('class="watermark"');
  });

  it('shows allocation number when present', () => {
    const html = renderInvoiceHtml(
      makeInput({
        invoice: makeInvoice({ allocationNumber: 'SHAAM-12345' }),
      })
    );
    expect(html).toContain('SHAAM-12345');
    expect(html).toContain('\u05DE\u05E1\u05E4\u05E8 \u05D4\u05E7\u05E6\u05D0\u05D4');
  });

  it('does not show allocation section when no allocation number', () => {
    const html = renderInvoiceHtml(makeInput());
    expect(html).not.toContain('\u05DE\u05E1\u05E4\u05E8 \u05D4\u05E7\u05E6\u05D0\u05D4');
  });

  it('includes VAT exemption reason when present', () => {
    const html = renderInvoiceHtml(
      makeInput({
        invoice: makeInvoice({
          vatExemptionReason: '\u05E2\u05E1\u05E7\u05EA \u05D9\u05D9\u05E6\u05D5\u05D0',
        }),
      })
    );
    expect(html).toContain('\u05E2\u05E1\u05E7\u05EA \u05D9\u05D9\u05E6\u05D5\u05D0');
  });

  it('includes business VAT number when present', () => {
    const html = renderInvoiceHtml(makeInput());
    expect(html).toContain('987654321');
  });

  it('formats dates in DD/MM/YYYY format', () => {
    const html = renderInvoiceHtml(makeInput());
    expect(html).toContain('01/03/2026');
  });

  it('includes footer with BON attribution', () => {
    const html = renderInvoiceHtml(makeInput());
    expect(html).toContain('BON v1.0');
  });

  it('renders credit note with correct label', () => {
    const html = renderInvoiceHtml(
      makeInput({
        invoice: makeInvoice({ documentType: 'credit_note' }),
      })
    );
    expect(html).toContain(
      '\u05D7\u05E9\u05D1\u05D5\u05E0\u05D9\u05EA \u05DE\u05E1 \u05D6\u05D9\u05DB\u05D5\u05D9'
    );
  });

  it('shows discount row when discount is present', () => {
    const html = renderInvoiceHtml(
      makeInput({
        invoice: makeInvoice({ discountMinorUnits: 500 }),
        items: [makeItem({ discountPercent: 5 })],
      })
    );
    expect(html).toContain('\u05D4\u05E0\u05D7\u05D4');
  });

  it('renders due date when present', () => {
    const html = renderInvoiceHtml(makeInput());
    expect(html).toContain('31/03/2026');
    expect(html).toContain('\u05EA\u05D0\u05E8\u05D9\u05DA \u05EA\u05E9\u05DC\u05D5\u05DD');
  });
});
