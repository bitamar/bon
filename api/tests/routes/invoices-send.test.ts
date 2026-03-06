import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { injectAuthed } from '../utils/inject.js';
import {
  createOwnerWithBusiness,
  createAuthedUser,
  createUser,
  createTestBusiness,
} from '../utils/businesses.js';
import { setupIntegrationTest } from '../utils/server.js';
import {
  mockPdfServiceFetch,
  createCustomer,
  createDraftWithItems,
  finalizeInvoice,
  setupFinalizedInvoice,
} from '../utils/invoices.js';
import type { InvoiceResponse } from '@bon/types/invoices';

async function sendInvoice(
  app: FastifyInstance,
  sessionId: string,
  businessId: string,
  invoiceId: string,
  payload: object = {}
) {
  return injectAuthed(app, sessionId, {
    method: 'POST',
    url: `/businesses/${businessId}/invoices/${invoiceId}/send`,
    payload,
  });
}

async function prepareFinalizedInvoice(app: FastifyInstance, email?: string) {
  mockPdfServiceFetch();
  return setupFinalizedInvoice(app, email);
}

describe('POST /businesses/:businessId/invoices/:invoiceId/send', () => {
  const ctx = setupIntegrationTest();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('sends a finalized invoice and returns sentAt', async () => {
    const { sessionId, business, invoice } = await prepareFinalizedInvoice(ctx.app);

    const res = await sendInvoice(ctx.app, sessionId, business.id, invoice.id);

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
    const { sessionId, business, invoice } = await prepareFinalizedInvoice(ctx.app);

    const res = await sendInvoice(ctx.app, sessionId, business.id, invoice.id, {
      recipientEmail: 'other@example.com',
    });

    expect(res.statusCode).toBe(200);
  });

  it('allows re-sending an already sent invoice', async () => {
    const { sessionId, business, invoice } = await prepareFinalizedInvoice(ctx.app);

    // Send first time
    const first = await sendInvoice(ctx.app, sessionId, business.id, invoice.id);
    expect(first.statusCode).toBe(200);

    // Send again
    const second = await sendInvoice(ctx.app, sessionId, business.id, invoice.id);
    expect(second.statusCode).toBe(200);
  });

  it('returns 422 when trying to send a draft invoice', async () => {
    mockPdfServiceFetch();
    const { sessionId, business } = await createOwnerWithBusiness();
    const customer = await createCustomer(ctx.app, sessionId, business.id);
    const { invoice } = await createDraftWithItems(ctx.app, sessionId, business.id, customer.id);

    const res = await sendInvoice(ctx.app, sessionId, business.id, invoice.id);

    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: string }).error).toBe('not_sendable');
  });

  it('returns 422 when no email is available', async () => {
    mockPdfServiceFetch();
    const { sessionId, business } = await createOwnerWithBusiness();
    const customer = await createCustomer(ctx.app, sessionId, business.id);
    const { invoice } = await createDraftWithItems(ctx.app, sessionId, business.id, customer.id);
    await finalizeInvoice(ctx.app, sessionId, business.id, invoice.id);

    const res = await sendInvoice(ctx.app, sessionId, business.id, invoice.id);

    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: string }).error).toBe('missing_email');
  });

  it('returns 404 for non-existent invoice', async () => {
    mockPdfServiceFetch();
    const { sessionId, business } = await createOwnerWithBusiness();

    const res = await sendInvoice(
      ctx.app,
      sessionId,
      business.id,
      '00000000-0000-4000-8000-000000000099'
    );

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
    mockPdfServiceFetch();
    const { sessionId: ownerSession, business } = await createOwnerWithBusiness();
    const customer = await createCustomer(ctx.app, ownerSession, business.id);
    const { invoice } = await createDraftWithItems(ctx.app, ownerSession, business.id, customer.id);
    await finalizeInvoice(ctx.app, ownerSession, business.id, invoice.id);

    const { sessionId: otherSession } = await createAuthedUser();
    const otherUser = await createUser();
    await createTestBusiness(otherUser.id);

    const res = await sendInvoice(ctx.app, otherSession, business.id, invoice.id);

    expect(res.statusCode).toBe(404);
  });
});
