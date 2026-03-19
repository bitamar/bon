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
import type { PgBoss } from 'pg-boss';

// ── helpers ──

function createMockBoss(): PgBoss {
  return {
    send: vi.fn().mockResolvedValue('mock-job-id'),
  } as unknown as PgBoss;
}

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
    // Mock pg-boss on the app instance for all send tests
    (ctx.app as unknown as { boss: PgBoss }).boss = createMockBoss();
  });

  it('returns 202 and enqueues a send-invoice-email job', async () => {
    const { sessionId, business, invoice } = await prepareFinalizedInvoice(ctx.app);

    const res = await sendInvoice(ctx.app, sessionId, business.id, invoice.id);

    expect(res.statusCode).toBe(202);
    const body = res.json() as { ok: true; status: string };
    expect(body.ok).toBe(true);
    expect(body.status).toBe('sending');

    // Verify pg-boss job was enqueued
    const boss = (ctx.app as unknown as { boss: PgBoss }).boss;
    expect(boss.send).toHaveBeenCalledOnce();
    expect(boss.send).toHaveBeenCalledWith(
      'send-invoice-email',
      expect.objectContaining({ invoiceId: invoice.id, businessId: business.id }),
      expect.objectContaining({ singletonKey: invoice.id })
    );

    // Verify invoice status changed to 'sending'
    const detailRes = await injectAuthed(ctx.app, sessionId, {
      method: 'GET',
      url: `/businesses/${business.id}/invoices/${invoice.id}`,
    });
    const detail = detailRes.json() as InvoiceResponse;
    expect(detail.invoice.status).toBe('sending');
  });

  it('sends to custom email when recipientEmail is provided', async () => {
    const { sessionId, business, invoice } = await prepareFinalizedInvoice(ctx.app);

    const res = await sendInvoice(ctx.app, sessionId, business.id, invoice.id, {
      recipientEmail: 'other@example.com',
    });

    expect(res.statusCode).toBe(202);
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

    const res = await sendInvoice(ctx.app, otherSession, business.id, invoice.id);

    expect(res.statusCode).toBe(404);
  });
});
