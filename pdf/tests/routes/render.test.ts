import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import Fastify from 'fastify';
import { renderRoutes } from '../../src/routes/render.js';
import { renderPdf } from '../../src/pdf/render-pdf.js';
import { renderInvoiceHtml } from '../../src/pdf/render-html.js';
import type { FastifyInstance } from 'fastify';

vi.mock('../../src/pdf/render-pdf.js', () => ({
  renderPdf: vi.fn(),
}));
vi.mock('../../src/pdf/render-html.js', () => ({
  renderInvoiceHtml: vi.fn(),
}));

const INVOICE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const BUSINESS_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const ITEM_ID = 'c3d4e5f6-a7b8-4c9d-ae1f-2a3b4c5d6e7f';

const VALID_INPUT = {
  business: {
    name: 'Test Business',
    businessType: 'licensed_dealer' as const,
    registrationNumber: '123456789',
    vatNumber: null,
    streetAddress: null,
    city: null,
    postalCode: null,
    phone: null,
    email: null,
    logoUrl: null,
  },
  invoice: {
    id: INVOICE_ID,
    businessId: BUSINESS_ID,
    customerId: null,
    customerName: 'Test Customer',
    customerTaxId: null,
    customerAddress: null,
    customerEmail: null,
    documentType: 'tax_invoice' as const,
    status: 'finalized' as const,
    isOverdue: false,
    sequenceGroup: 'tax_document' as const,
    sequenceNumber: 1,
    documentNumber: 'INV-0001',
    creditedInvoiceId: null,
    invoiceDate: '2026-03-01',
    issuedAt: '2026-03-01T10:00:00.000Z',
    dueDate: null,
    notes: null,
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
  },
  items: [
    {
      id: ITEM_ID,
      invoiceId: INVOICE_ID,
      position: 0,
      description: 'Test Item',
      catalogNumber: null,
      quantity: 1,
      unitPriceMinorUnits: 10000,
      discountPercent: 0,
      vatRateBasisPoints: 1700,
      lineTotalMinorUnits: 10000,
      vatAmountMinorUnits: 1700,
      lineTotalInclVatMinorUnits: 11700,
    },
  ],
  isDraft: false,
};

// ── helpers ──

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(renderRoutes);
  await app.ready();
  return app;
}

describe('renderRoutes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('GET /health returns 200 with { ok: true }', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  describe('POST /render', () => {
    it('returns 200 with application/pdf content type on happy path', async () => {
      const pdfBuffer = Buffer.from('fake-pdf-content');
      vi.mocked(renderPdf).mockResolvedValue(pdfBuffer);

      const res = await app.inject({
        method: 'POST',
        url: '/render',
        payload: VALID_INPUT,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.rawPayload).toEqual(pdfBuffer);
    });

    it('returns 400 for invalid input', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/render',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'invalid_input' });
    });

    it('returns 503 when renderPdf throws with statusCode 503', async () => {
      const err = Object.assign(new Error('too many renders'), { statusCode: 503 });
      vi.mocked(renderPdf).mockRejectedValue(err);

      const res = await app.inject({
        method: 'POST',
        url: '/render',
        payload: VALID_INPUT,
      });

      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ error: 'too_many_concurrent_renders' });
    });

    it('returns 500 when renderPdf throws a generic error', async () => {
      vi.mocked(renderPdf).mockRejectedValue(new Error('unexpected failure'));

      const res = await app.inject({
        method: 'POST',
        url: '/render',
        payload: VALID_INPUT,
      });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: 'render_failed' });
    });
  });

  describe('POST /render-html', () => {
    it('returns 200 with text/html content type on happy path', async () => {
      const html = '<!DOCTYPE html><html><body>invoice</body></html>';
      vi.mocked(renderInvoiceHtml).mockReturnValue(html);

      const res = await app.inject({
        method: 'POST',
        url: '/render-html',
        payload: VALID_INPUT,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toBe(html);
    });

    it('returns 400 for invalid input', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/render-html',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'invalid_input' });
    });
  });
});
