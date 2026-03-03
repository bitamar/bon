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

function mockPdfService(): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(FAKE_PDF, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    })
  );
}

describe('POST /businesses/:businessId/invoices/:invoiceId/send', () => {
  const ctx = setupIntegrationTest();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  async function createCustomer(
    sessionId: string,
    businessId: string,
    email = 'customer@example.com'
  ) {
    const res = await injectAuthed(ctx.app, sessionId, {
      method: 'POST',
      url: `/businesses/${businessId}/customers`,
      payload: { name: 'Test Customer', email },
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

  async function sendInvoice(
    sessionId: string,
    businessId: string,
    invoiceId: string,
    payload: object = {}
  ) {
    return injectAuthed(ctx.app, sessionId, {
      method: 'POST',
      url: `/businesses/${businessId}/invoices/${invoiceId}/send`,
      payload,
    });
  }

  async function setupFinalizedInvoice(customerEmail = 'customer@example.com') {
    const { sessionId, business } = await createOwnerWithBusiness();
    const customer = await createCustomer(sessionId, business.id, customerEmail);
    const { invoice } = await createDraftWithItems(sessionId, business.id, customer.id);
    await finalizeInvoice(sessionId, business.id, invoice.id);
    return { sessionId, business, invoice };
  }

  it('sends a finalized invoice and returns sentAt', async () => {
    mockPdfService();
    const { sessionId, business, invoice } = await setupFinalizedInvoice();

    const res = await sendInvoice(sessionId, business.id, invoice.id);

    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: true; sentAt: string };
    expect(body.ok).toBe(true);
    expect(body.sentAt).toBeTruthy();

    // Verify invoice status changed to 'sent'
    const detailRes = await injectAuthed(ctx.app, sessionId, {
      method: 'GET',
      url: `/businesses/${business.id}/invoices/${invoice.id}`,
    });
    const detail = detailRes.json() as InvoiceResponse;
    expect(detail.invoice.status).toBe('sent');
    expect(detail.invoice.sentAt).toBeTruthy();
  });

  it('sends to custom email when recipientEmail is provided', async () => {
    mockPdfService();
    const { sessionId, business, invoice } = await setupFinalizedInvoice();

    const res = await sendInvoice(sessionId, business.id, invoice.id, {
      recipientEmail: 'other@example.com',
    });

    expect(res.statusCode).toBe(200);
  });

  it('allows re-sending an already sent invoice', async () => {
    mockPdfService();
    const { sessionId, business, invoice } = await setupFinalizedInvoice();

    // Send first time
    const first = await sendInvoice(sessionId, business.id, invoice.id);
    expect(first.statusCode).toBe(200);

    // Send again
    const second = await sendInvoice(sessionId, business.id, invoice.id);
    expect(second.statusCode).toBe(200);
  });

  it('returns 422 when trying to send a draft invoice', async () => {
    mockPdfService();
    const { sessionId, business } = await createOwnerWithBusiness();
    const customer = await createCustomer(sessionId, business.id);
    const { invoice } = await createDraftWithItems(sessionId, business.id, customer.id);

    const res = await sendInvoice(sessionId, business.id, invoice.id);

    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: string }).error).toBe('not_sendable');
  });

  it('returns 422 when no email is available', async () => {
    mockPdfService();
    const { sessionId, business } = await createOwnerWithBusiness();
    // Create customer without email
    const cusRes = await injectAuthed(ctx.app, sessionId, {
      method: 'POST',
      url: `/businesses/${business.id}/customers`,
      payload: { name: 'No Email Customer' },
    });
    const customer = (cusRes.json() as { customer: { id: string } }).customer;
    const { invoice } = await createDraftWithItems(sessionId, business.id, customer.id);
    await finalizeInvoice(sessionId, business.id, invoice.id);

    const res = await sendInvoice(sessionId, business.id, invoice.id);

    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: string }).error).toBe('missing_email');
  });

  it('returns 404 for non-existent invoice', async () => {
    mockPdfService();
    const { sessionId, business } = await createOwnerWithBusiness();

    const res = await sendInvoice(sessionId, business.id, '00000000-0000-4000-8000-000000000099');

    expect(res.statusCode).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    const ownerUser = await createUser();
    const business = await createTestBusiness(ownerUser.id);

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/businesses/${business.id}/invoices/00000000-0000-4000-8000-000000000001/send`,
      payload: {},
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for non-member business', async () => {
    mockPdfService();
    const { sessionId: ownerSession, business } = await createOwnerWithBusiness();
    const customer = await createCustomer(ownerSession, business.id);
    const { invoice } = await createDraftWithItems(ownerSession, business.id, customer.id);
    await finalizeInvoice(ownerSession, business.id, invoice.id);

    const { sessionId: otherSession } = await createAuthedUser();
    const otherUser = await createUser();
    await createTestBusiness(otherUser.id);

    const res = await sendInvoice(otherSession, business.id, invoice.id);

    expect(res.statusCode).toBe(404);
  });
});
