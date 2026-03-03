import { describe, it, expect } from 'vitest';
import { renderInvoiceHtml } from '../../src/pdf/render-html.js';
import { makeInput, makeInvoice, makeItem } from '../fixtures.js';

describe('renderInvoiceHtml', () => {
  // ── helpers ──

  function renderDefault(overrides?: Parameters<typeof makeInput>[0]) {
    return renderInvoiceHtml(makeInput(overrides));
  }

  it('renders valid HTML with DOCTYPE', () => {
    const html = renderDefault();
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<html dir="rtl" lang="he">');
  });

  it('includes business name and registration number', () => {
    const html = renderDefault();
    expect(html).toContain('\u05D7\u05D1\u05E8\u05EA \u05D1\u05D3\u05D9\u05E7\u05D4');
    expect(html).toContain('123456789');
  });

  it('includes document type label and number', () => {
    const html = renderDefault();
    expect(html).toContain('\u05D7\u05E9\u05D1\u05D5\u05E0\u05D9\u05EA \u05DE\u05E1');
    expect(html).toContain('INV-0042');
  });

  it('includes customer details', () => {
    const html = renderDefault();
    expect(html).toContain('\u05DC\u05E7\u05D5\u05D7 \u05D8\u05E1\u05D8');
    expect(html).toContain('111111111');
    expect(html).toContain('customer@example.com');
  });

  it('includes line item description', () => {
    const html = renderDefault();
    expect(html).toContain('\u05E9\u05D9\u05E8\u05D5\u05EA \u05D9\u05D9\u05E2\u05D5\u05E5');
  });

  it('includes formatted totals', () => {
    const html = renderDefault();
    // The totals should be formatted as currency
    expect(html).toContain('\u05E1\u05D4&quot;\u05DB \u05DC\u05EA\u05E9\u05DC\u05D5\u05DD');
  });

  it('includes notes when present', () => {
    const html = renderDefault();
    expect(html).toContain('\u05D4\u05E2\u05E8\u05D4 \u05DC\u05D3\u05D5\u05D2\u05DE\u05D4');
  });

  it('shows draft watermark when isDraft is true', () => {
    const html = renderDefault({ isDraft: true });
    expect(html).toContain('\u05D8\u05D9\u05D5\u05D8\u05D4');
    expect(html).toContain('class="watermark"');
  });

  it('does not show watermark element when isDraft is false', () => {
    const html = renderDefault({ isDraft: false });
    expect(html).not.toContain('class="watermark"');
  });

  it('shows allocation number when present', () => {
    const html = renderDefault({
      invoice: makeInvoice({ allocationNumber: 'SHAAM-12345' }),
    });
    expect(html).toContain('SHAAM-12345');
    expect(html).toContain('\u05DE\u05E1\u05E4\u05E8 \u05D4\u05E7\u05E6\u05D0\u05D4');
  });

  it('does not show allocation section when no allocation number', () => {
    const html = renderDefault();
    expect(html).not.toContain('\u05DE\u05E1\u05E4\u05E8 \u05D4\u05E7\u05E6\u05D0\u05D4');
  });

  it('includes VAT exemption reason when present', () => {
    const html = renderDefault({
      invoice: makeInvoice({
        vatExemptionReason: '\u05E2\u05E1\u05E7\u05EA \u05D9\u05D9\u05E6\u05D5\u05D0',
      }),
    });
    expect(html).toContain('\u05E2\u05E1\u05E7\u05EA \u05D9\u05D9\u05E6\u05D5\u05D0');
  });

  it('includes business VAT number when present', () => {
    const html = renderDefault();
    expect(html).toContain('987654321');
  });

  it('formats dates in DD/MM/YYYY format', () => {
    const html = renderDefault();
    expect(html).toContain('01/03/2026');
  });

  it('includes footer with BON attribution', () => {
    const html = renderDefault();
    expect(html).toContain('BON v1.0');
  });

  it('renders credit note with correct label', () => {
    const html = renderDefault({
      invoice: makeInvoice({ documentType: 'credit_note' }),
    });
    expect(html).toContain(
      '\u05D7\u05E9\u05D1\u05D5\u05E0\u05D9\u05EA \u05DE\u05E1 \u05D6\u05D9\u05DB\u05D5\u05D9'
    );
  });

  it('shows discount row when discount is present', () => {
    const html = renderDefault({
      invoice: makeInvoice({ discountMinorUnits: 500 }),
      items: [makeItem({ discountPercent: 5 })],
    });
    expect(html).toContain('\u05D4\u05E0\u05D7\u05D4');
  });

  it('renders due date when present', () => {
    const html = renderDefault();
    expect(html).toContain('31/03/2026');
    expect(html).toContain('\u05EA\u05D0\u05E8\u05D9\u05DA \u05EA\u05E9\u05DC\u05D5\u05DD');
  });
});
