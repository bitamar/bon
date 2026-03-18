import { describe, expect, it, vi, beforeEach } from 'vitest';
import { injectAuthed } from '../utils/inject.js';
import {
  createOwnerWithBusiness,
  createAuthedUser,
  createUser,
  createTestBusiness,
} from '../utils/businesses.js';
import { setupIntegrationTest } from '../utils/server.js';
import {
  FAKE_PDF,
  mockPdfServiceFetch,
  createCustomer,
  createDraftWithItems,
  setupFinalizedInvoice,
} from '../utils/invoices.js';
import type { InvoiceResponse } from '@bon/types/invoices';

describe('GET /businesses/:businessId/invoices/:invoiceId/pdf', () => {
  const ctx = setupIntegrationTest();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── helpers ──

  async function getPdf(sessionId: string, businessId: string, invoiceId: string) {
    return injectAuthed(ctx.app, sessionId, {
      method: 'GET',
      url: `/businesses/${businessId}/invoices/${invoiceId}/pdf`,
    });
  }

  it('returns PDF for a finalized invoice', async () => {
    mockPdfServiceFetch();
    const { sessionId, business, invoice } = await setupFinalizedInvoice(ctx.app);

    const res = await getPdf(sessionId, business.id, invoice.id);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/^inline; filename="/);
    expect(res.rawPayload).toEqual(FAKE_PDF);
  });

  it('returns 502 when PDF service is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));
    const { sessionId, business } = await createOwnerWithBusiness();
    const customer = await createCustomer(ctx.app, sessionId, business.id);
    const { invoice } = await createDraftWithItems(ctx.app, sessionId, business.id, customer.id);

    const res = await getPdf(sessionId, business.id, invoice.id);

    expect(res.statusCode).toBe(502);
  });

  it('passes invoice data to the PDF service', async () => {
    const fetchSpy = mockPdfServiceFetch();

    const { sessionId, business, invoice } = await setupFinalizedInvoice(ctx.app);

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
    const fetchSpy = mockPdfServiceFetch();

    const { sessionId, business } = await createOwnerWithBusiness();
    const customer = await createCustomer(ctx.app, sessionId, business.id);
    const { invoice } = await createDraftWithItems(ctx.app, sessionId, business.id, customer.id);

    await getPdf(sessionId, business.id, invoice.id);

    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body);
    expect(body.isDraft).toBe(true);
  });

  it('returns 404 for non-existent invoice', async () => {
    mockPdfServiceFetch();
    const { sessionId, business } = await createOwnerWithBusiness();

    const res = await getPdf(sessionId, business.id, '00000000-0000-4000-8000-000000000099');

    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for non-member business', async () => {
    mockPdfServiceFetch();
    const { business, invoice } = await setupFinalizedInvoice(ctx.app);

    const { sessionId: otherSession } = await createAuthedUser();
    const otherUser = await createUser();
    await createTestBusiness(otherUser.id);

    const res = await getPdf(otherSession, business.id, invoice.id);

    expect(res.statusCode).toBe(404);
  });

  it('returns 504 when PDF service times out', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);

    const { sessionId, business } = await createOwnerWithBusiness();
    const customer = await createCustomer(ctx.app, sessionId, business.id);
    const { invoice } = await createDraftWithItems(ctx.app, sessionId, business.id, customer.id);

    const res = await getPdf(sessionId, business.id, invoice.id);

    expect(res.statusCode).toBe(504);
  });

  it('returns 502 when PDF service returns non-ok status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', { status: 500 })
    );

    const { sessionId, business } = await createOwnerWithBusiness();
    const customer = await createCustomer(ctx.app, sessionId, business.id);
    const { invoice } = await createDraftWithItems(ctx.app, sessionId, business.id, customer.id);

    const res = await getPdf(sessionId, business.id, invoice.id);

    expect(res.statusCode).toBe(502);
  });

  it('returns 502 when PDF service returns wrong content-type', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>Error</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    );

    const { sessionId, business } = await createOwnerWithBusiness();
    const customer = await createCustomer(ctx.app, sessionId, business.id);
    const { invoice } = await createDraftWithItems(ctx.app, sessionId, business.id, customer.id);

    const res = await getPdf(sessionId, business.id, invoice.id);

    expect(res.statusCode).toBe(502);
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
    mockPdfServiceFetch();
    const { sessionId, business, invoice } = await setupFinalizedInvoice(ctx.app);

    // Re-fetch the invoice to get the finalized document number
    const invoiceRes = await injectAuthed(ctx.app, sessionId, {
      method: 'GET',
      url: `/businesses/${business.id}/invoices/${invoice.id}`,
    });
    const { invoice: finalized } = invoiceRes.json() as InvoiceResponse;

    const res = await getPdf(sessionId, business.id, invoice.id);

    expect(res.statusCode).toBe(200);
    const disposition = res.headers['content-disposition'] as string;
    expect(finalized.documentNumber).toBeTruthy();
    expect(disposition).toContain(`${finalized.documentNumber}.pdf"`);
  });

  it('serves finalized PDF from cache on second request without calling PDF service again', async () => {
    const fetchSpy = mockPdfServiceFetch();

    const { sessionId, business, invoice } = await setupFinalizedInvoice(ctx.app);

    await getPdf(sessionId, business.id, invoice.id);
    const secondRes = await getPdf(sessionId, business.id, invoice.id);

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(secondRes.statusCode).toBe(200);
    expect(secondRes.rawPayload).toEqual(FAKE_PDF);
  });
});
