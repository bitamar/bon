import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { injectAuthed } from '../utils/inject.js';
import { createOwnerWithBusiness } from '../utils/businesses.js';
import { setupIntegrationTest } from '../utils/server.js';
import { createCustomer, DEFAULT_ITEM, finalizeInvoice } from '../utils/invoices.js';
import type { InvoiceResponse } from '@bon/types/invoices';

// ── helpers ──

async function createDraftWithItems(
  app: FastifyInstance,
  sessionId: string,
  businessId: string,
  customerId: string,
  items = [DEFAULT_ITEM]
) {
  const res = await injectAuthed(app, sessionId, {
    method: 'POST',
    url: `/businesses/${businessId}/invoices`,
    payload: { documentType: 'tax_invoice', customerId, items },
  });
  return res.json() as InvoiceResponse;
}

async function setupFinalizedInvoice(app: FastifyInstance) {
  const { sessionId, business } = await createOwnerWithBusiness();
  const customer = await createCustomer(app, sessionId, business.id);
  const { invoice: draft } = await createDraftWithItems(app, sessionId, business.id, customer.id);
  await finalizeInvoice(app, sessionId, business.id, draft.id);
  const detailRes = await injectAuthed(app, sessionId, {
    method: 'GET',
    url: `/businesses/${business.id}/invoices/${draft.id}`,
  });
  const { invoice } = detailRes.json() as InvoiceResponse;
  return { sessionId, business, customer, invoice };
}

async function postCreditNote(
  app: FastifyInstance,
  sessionId: string,
  businessId: string,
  invoiceId: string,
  payload: object
) {
  return injectAuthed(app, sessionId, {
    method: 'POST',
    url: `/businesses/${businessId}/invoices/${invoiceId}/credit-note`,
    payload,
  });
}

describe('POST /businesses/:businessId/invoices/:invoiceId/credit-note', () => {
  const ctx = setupIntegrationTest();

  // ── tests ──

  it('creates a full credit note for a finalized invoice', async () => {
    const { sessionId, business, invoice } = await setupFinalizedInvoice(ctx.app);

    const res = await postCreditNote(ctx.app, sessionId, business.id, invoice.id, {
      items: [DEFAULT_ITEM],
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as InvoiceResponse;
    expect(body.invoice.documentType).toBe('credit_note');
    expect(body.invoice.status).toBe('finalized');
    expect(body.invoice.creditedInvoiceId).toBe(invoice.id);
    expect(body.invoice.sequenceGroup).toBe('credit_note');
    expect(body.invoice.documentNumber).toBeTruthy();
    expect(body.items).toHaveLength(1);

    // Source invoice should now be 'credited'
    const sourceRes = await injectAuthed(ctx.app, sessionId, {
      method: 'GET',
      url: `/businesses/${business.id}/invoices/${invoice.id}`,
    });
    const sourceBody = sourceRes.json() as InvoiceResponse;
    expect(sourceBody.invoice.status).toBe('credited');
  });

  it('creates a partial credit note without marking source as credited', async () => {
    const { sessionId, business, invoice } = await setupFinalizedInvoice(ctx.app);

    const partialItem = { ...DEFAULT_ITEM, quantity: 0.5 };
    const res = await postCreditNote(ctx.app, sessionId, business.id, invoice.id, {
      items: [partialItem],
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as InvoiceResponse;
    expect(body.invoice.totalInclVatMinorUnits).toBeLessThan(invoice.totalInclVatMinorUnits);

    // Source invoice should remain in original status (not 'credited')
    const sourceRes = await injectAuthed(ctx.app, sessionId, {
      method: 'GET',
      url: `/businesses/${business.id}/invoices/${invoice.id}`,
    });
    const sourceBody = sourceRes.json() as InvoiceResponse;
    expect(sourceBody.invoice.status).toBe('finalized');
  });

  it('rejects credit note when quantity exceeds source line', async () => {
    const { sessionId, business, invoice } = await setupFinalizedInvoice(ctx.app);

    const overItem = { ...DEFAULT_ITEM, quantity: 999 };
    const res = await postCreditNote(ctx.app, sessionId, business.id, invoice.id, {
      items: [overItem],
    });

    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: string }).error).toBe('invalid_credit_line');
  });

  it('rejects credit note when unitPriceMinorUnits exceeds source line', async () => {
    const { sessionId, business, invoice } = await setupFinalizedInvoice(ctx.app);

    const overPriceItem = { ...DEFAULT_ITEM, unitPriceMinorUnits: 999999 };
    const res = await postCreditNote(ctx.app, sessionId, business.id, invoice.id, {
      items: [overPriceItem],
    });

    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: string }).error).toBe('invalid_credit_line');
  });

  it('rejects credit note with non-matching position', async () => {
    const { sessionId, business, invoice } = await setupFinalizedInvoice(ctx.app);

    const badPositionItem = { ...DEFAULT_ITEM, position: 99 };
    const res = await postCreditNote(ctx.app, sessionId, business.id, invoice.id, {
      items: [badPositionItem],
    });

    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: string }).error).toBe('invalid_credit_line');
  });

  it('rejects credit note for a draft invoice', async () => {
    const { sessionId, business } = await createOwnerWithBusiness();
    const customer = await createCustomer(ctx.app, sessionId, business.id);
    const { invoice: draft } = await createDraftWithItems(
      ctx.app,
      sessionId,
      business.id,
      customer.id
    );

    const res = await postCreditNote(ctx.app, sessionId, business.id, draft.id, {
      items: [DEFAULT_ITEM],
    });

    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: string }).error).toBe('invoice_not_creditable');
  });

  it('rejects credit note for an already-credited invoice', async () => {
    const { sessionId, business, invoice } = await setupFinalizedInvoice(ctx.app);

    // Create first credit note
    await postCreditNote(ctx.app, sessionId, business.id, invoice.id, {
      items: [DEFAULT_ITEM],
    });

    // Try second credit note — should fail since invoice is now 'credited'
    const res = await postCreditNote(ctx.app, sessionId, business.id, invoice.id, {
      items: [DEFAULT_ITEM],
    });

    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: string }).error).toBe('invoice_not_creditable');
  });

  it('rejects credit note with empty items', async () => {
    const { sessionId, business, invoice } = await setupFinalizedInvoice(ctx.app);

    const res = await postCreditNote(ctx.app, sessionId, business.id, invoice.id, {
      items: [],
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects credit note when source is itself a credit note', async () => {
    const { sessionId, business, invoice } = await setupFinalizedInvoice(ctx.app);

    // Create a credit note
    const cnRes = await postCreditNote(ctx.app, sessionId, business.id, invoice.id, {
      items: [DEFAULT_ITEM],
    });
    const creditNote = (cnRes.json() as InvoiceResponse).invoice;

    // Try to credit the credit note — should fail
    const res = await postCreditNote(ctx.app, sessionId, business.id, creditNote.id, {
      items: [DEFAULT_ITEM],
    });

    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: string }).error).toBe('cannot_credit_credit_note');
  });

  it('includes back-link data in get invoice response', async () => {
    const { sessionId, business, invoice } = await setupFinalizedInvoice(ctx.app);

    // Create credit note
    const cnRes = await postCreditNote(ctx.app, sessionId, business.id, invoice.id, {
      items: [DEFAULT_ITEM],
    });
    const creditNote = (cnRes.json() as InvoiceResponse).invoice;

    // Fetch credit note — should include source document number
    const cnDetailRes = await injectAuthed(ctx.app, sessionId, {
      method: 'GET',
      url: `/businesses/${business.id}/invoices/${creditNote.id}`,
    });
    const cnDetail = cnDetailRes.json() as InvoiceResponse;
    expect(cnDetail.creditedInvoiceDocumentNumber).toBe(invoice.documentNumber);

    // Fetch source invoice — should include credit notes array
    const sourceRes = await injectAuthed(ctx.app, sessionId, {
      method: 'GET',
      url: `/businesses/${business.id}/invoices/${invoice.id}`,
    });
    const sourceDetail = sourceRes.json() as InvoiceResponse;
    expect(sourceDetail.creditNotes).toHaveLength(1);
    expect(sourceDetail.creditNotes[0]!.id).toBe(creditNote.id);
  });

  it('assigns sequential numbers from the credit_note sequence group', async () => {
    const { sessionId, business, invoice: inv1 } = await setupFinalizedInvoice(ctx.app);

    // Create first credit note
    const res1 = await postCreditNote(ctx.app, sessionId, business.id, inv1.id, {
      items: [DEFAULT_ITEM],
    });
    const cn1 = (res1.json() as InvoiceResponse).invoice;

    // Create a second finalized invoice and credit it
    const customer = await createCustomer(ctx.app, sessionId, business.id);
    const { invoice: draft2 } = await createDraftWithItems(
      ctx.app,
      sessionId,
      business.id,
      customer.id
    );
    await finalizeInvoice(ctx.app, sessionId, business.id, draft2.id);
    const res2 = await postCreditNote(ctx.app, sessionId, business.id, draft2.id, {
      items: [DEFAULT_ITEM],
    });
    const cn2 = (res2.json() as InvoiceResponse).invoice;

    expect(cn1.sequenceNumber).toBe(1);
    expect(cn2.sequenceNumber).toBe(2);
  });
});
