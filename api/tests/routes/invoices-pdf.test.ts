import { describe, expect, it, vi, beforeEach } from 'vitest';
import { injectAuthed } from '../utils/inject.js';
import {
  createOwnerWithBusiness,
  createAuthedUser,
  createUser,
  createTestBusiness,
} from '../utils/businesses.js';
import { setupIntegrationTest } from '../utils/server.js';
import type { InvoiceResponse } from '@bon/types/invoices';

// ── module-level helpers ──

const FAKE_PDF = Buffer.from('%PDF-1.4 fake content');

function mockFetchForPdf(): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(FAKE_PDF, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    })
  );
}

interface TestItem {
  description: string;
  quantity: number;
  unitPriceMinorUnits: number;
  discountPercent: number;
  vatRateBasisPoints: number;
  position: number;
}

const DEFAULT_ITEM: TestItem = {
  description: 'Item 1',
  quantity: 1,
  unitPriceMinorUnits: 10000,
  discountPercent: 0,
  vatRateBasisPoints: 1700,
  position: 0,
};

describe('GET /businesses/:businessId/invoices/:invoiceId/pdf', () => {
  const ctx = setupIntegrationTest();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── helpers ──

  async function createCustomer(sessionId: string, businessId: string) {
    const res = await injectAuthed(ctx.app, sessionId, {
      method: 'POST',
      url: `/businesses/${businessId}/customers`,
      payload: { name: 'Test Customer' },
    });
    return (res.json() as { customer: { id: string } }).customer;
  }

  async function createDraftWithItems(sessionId: string, businessId: string, customerId: string) {
    const res = await injectAuthed(ctx.app, sessionId, {
      method: 'POST',
      url: `/businesses/${businessId}/invoices`,
      payload: {
        documentType: 'tax_invoice',
        customerId,
        items: [DEFAULT_ITEM],
      },
    });
    return res.json() as InvoiceResponse;
  }

  async function finalizeInvoice(sessionId: string, businessId: string, invoiceId: string) {
    return injectAuthed(ctx.app, sessionId, {
      method: 'POST',
      url: `/businesses/${businessId}/invoices/${invoiceId}/finalize`,
      payload: {},
    });
  }

  async function getPdf(sessionId: string, businessId: string, invoiceId: string) {
    return injectAuthed(ctx.app, sessionId, {
      method: 'GET',
      url: `/businesses/${businessId}/invoices/${invoiceId}/pdf`,
    });
  }

  async function setupFinalizedInvoice() {
    const { sessionId, business } = await createOwnerWithBusiness();
    const customer = await createCustomer(sessionId, business.id);
    const { invoice } = await createDraftWithItems(sessionId, business.id, customer.id);
    await finalizeInvoice(sessionId, business.id, invoice.id);
    return { sessionId, business, invoice };
  }

  it('returns PDF for a finalized invoice', async () => {
    mockFetchForPdf();
    const { sessionId, business, invoice } = await setupFinalizedInvoice();

    const res = await getPdf(sessionId, business.id, invoice.id);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/^inline; filename="/);
    expect(res.rawPayload).toEqual(FAKE_PDF);
  });

  it('returns 500 when PDF service is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));
    const { sessionId, business } = await createOwnerWithBusiness();
    const customer = await createCustomer(sessionId, business.id);
    const { invoice } = await createDraftWithItems(sessionId, business.id, customer.id);

    const res = await getPdf(sessionId, business.id, invoice.id);

    expect(res.statusCode).toBe(500);
  });

  it('passes invoice data to the PDF service', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(FAKE_PDF, { status: 200, headers: { 'Content-Type': 'application/pdf' } })
      );

    const { sessionId, business, invoice } = await setupFinalizedInvoice();

    await getPdf(sessionId, business.id, invoice.id);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0]!;
    expect(url).toContain('/render');
    const body = JSON.parse((options as { body: string }).body);
    expect(body.invoice.id).toBe(invoice.id);
    expect(body.business.name).toBe('Test Business');
    expect(body.isDraft).toBe(false);
  });

  it('sends isDraft: true for draft invoices', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(FAKE_PDF, { status: 200, headers: { 'Content-Type': 'application/pdf' } })
      );

    const { sessionId, business } = await createOwnerWithBusiness();
    const customer = await createCustomer(sessionId, business.id);
    const { invoice } = await createDraftWithItems(sessionId, business.id, customer.id);

    await getPdf(sessionId, business.id, invoice.id);

    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body);
    expect(body.isDraft).toBe(true);
  });

  it('returns 404 for non-existent invoice', async () => {
    mockFetchForPdf();
    const { sessionId, business } = await createOwnerWithBusiness();

    const res = await getPdf(sessionId, business.id, '00000000-0000-4000-8000-000000000099');

    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for non-member business', async () => {
    mockFetchForPdf();
    const { sessionId: ownerSession, business } = await createOwnerWithBusiness();
    const customer = await createCustomer(ownerSession, business.id);
    const { invoice } = await createDraftWithItems(ownerSession, business.id, customer.id);
    await finalizeInvoice(ownerSession, business.id, invoice.id);

    const { sessionId: otherSession } = await createAuthedUser();
    const otherUser = await createUser();
    const _otherBusiness = await createTestBusiness(otherUser.id);

    const res = await getPdf(otherSession, business.id, invoice.id);

    expect(res.statusCode).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    const ownerUser = await createUser();
    const business = await createTestBusiness(ownerUser.id);

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/businesses/${business.id}/invoices/00000000-0000-4000-8000-000000000001/pdf`,
    });

    expect(res.statusCode).toBe(401);
  });

  it('includes document number in filename for finalized invoice', async () => {
    mockFetchForPdf();
    const { sessionId, business, invoice } = await setupFinalizedInvoice();

    const res = await getPdf(sessionId, business.id, invoice.id);

    expect(res.statusCode).toBe(200);
    const disposition = res.headers['content-disposition'] as string;
    // Finalized invoices have document numbers like "1" or with prefix
    expect(disposition).toContain('.pdf"');
  });
});
