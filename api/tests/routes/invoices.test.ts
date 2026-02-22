import { describe, expect, it } from 'vitest';
import { injectAuthed } from '../utils/inject.js';
import {
  createOwnerWithBusiness,
  createAuthedUser,
  createTestBusiness,
  createUser,
  addUserToBusiness,
} from '../utils/businesses.js';
import { setupIntegrationTest } from '../utils/server.js';
import type { InvoiceResponse } from '@bon/types/invoices';

// ── module-level helpers ──

async function setupNonMemberScenario() {
  const { sessionId } = await createAuthedUser();
  const ownerUser = await createUser();
  const business = await createTestBusiness(ownerUser.id);
  return { sessionId, business };
}

describe('routes/invoices', () => {
  const ctx = setupIntegrationTest();

  // ── helpers ──

  async function postInvoice(sessionId: string, businessId: string, payload: object) {
    return injectAuthed(ctx.app, sessionId, {
      method: 'POST',
      url: `/businesses/${businessId}/invoices`,
      payload,
    });
  }

  async function getInvoice(sessionId: string, businessId: string, invoiceId: string) {
    return injectAuthed(ctx.app, sessionId, {
      method: 'GET',
      url: `/businesses/${businessId}/invoices/${invoiceId}`,
    });
  }

  async function patchInvoice(
    sessionId: string,
    businessId: string,
    invoiceId: string,
    payload: object
  ) {
    return injectAuthed(ctx.app, sessionId, {
      method: 'PATCH',
      url: `/businesses/${businessId}/invoices/${invoiceId}`,
      payload,
    });
  }

  async function deleteInvoice(sessionId: string, businessId: string, invoiceId: string) {
    return injectAuthed(ctx.app, sessionId, {
      method: 'DELETE',
      url: `/businesses/${businessId}/invoices/${invoiceId}`,
    });
  }

  async function finalizeInvoice(
    sessionId: string,
    businessId: string,
    invoiceId: string,
    payload: object = {}
  ) {
    return injectAuthed(ctx.app, sessionId, {
      method: 'POST',
      url: `/businesses/${businessId}/invoices/${invoiceId}/finalize`,
      payload,
    });
  }

  async function createCustomer(sessionId: string, businessId: string, payload?: object) {
    const res = await injectAuthed(ctx.app, sessionId, {
      method: 'POST',
      url: `/businesses/${businessId}/customers`,
      payload: payload ?? { name: 'Test Customer' },
    });
    return (res.json() as { customer: { id: string } }).customer;
  }

  async function createDraftWithItems(
    sessionId: string,
    businessId: string,
    customerId: string,
    items?: object[]
  ) {
    const res = await postInvoice(sessionId, businessId, {
      documentType: 'tax_invoice',
      customerId,
      items: items ?? [
        {
          description: 'Item 1',
          quantity: 1,
          unitPriceAgora: 10000,
          discountPercent: 0,
          vatRateBasisPoints: 1700,
          position: 0,
        },
      ],
    });
    return res.json() as InvoiceResponse;
  }

  // ── POST ──

  describe('POST /businesses/:businessId/invoices', () => {
    it('creates a minimal draft', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await postInvoice(sessionId, business.id, {
        documentType: 'tax_invoice',
      });

      expect(res.statusCode).toBe(201);
      const body = res.json() as InvoiceResponse;
      expect(body.invoice.documentType).toBe('tax_invoice');
      expect(body.invoice.status).toBe('draft');
      expect(body.invoice.customerId).toBeNull();
      expect(body.items).toHaveLength(0);
    });

    it('creates a draft with items', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await postInvoice(sessionId, business.id, {
        documentType: 'tax_invoice',
        items: [
          {
            description: 'Widget',
            quantity: 2,
            unitPriceAgora: 5000,
            discountPercent: 10,
            vatRateBasisPoints: 1700,
            position: 0,
          },
        ],
      });

      expect(res.statusCode).toBe(201);
      const body = res.json() as InvoiceResponse;
      expect(body.items).toHaveLength(1);
      expect(body.items[0]?.description).toBe('Widget');
      expect(body.items[0]?.quantity).toBe(2);
      expect(body.invoice.totalInclVatAgora).toBeGreaterThan(0);
    });

    it('returns 401 when unauthenticated', async () => {
      const ownerUser = await createUser();
      const business = await createTestBusiness(ownerUser.id);

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/businesses/${business.id}/invoices`,
        payload: { documentType: 'tax_invoice' },
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 404 for non-member business', async () => {
      const { sessionId, business } = await setupNonMemberScenario();

      const res = await postInvoice(sessionId, business.id, {
        documentType: 'tax_invoice',
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ── GET ──

  describe('GET /businesses/:businessId/invoices/:invoiceId', () => {
    it('fetches an invoice with items', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const customer = await createCustomer(sessionId, business.id);
      const created = await createDraftWithItems(sessionId, business.id, customer.id);

      const res = await getInvoice(sessionId, business.id, created.invoice.id);

      expect(res.statusCode).toBe(200);
      const body = res.json() as InvoiceResponse;
      expect(body.invoice.id).toBe(created.invoice.id);
      expect(body.items).toHaveLength(1);
    });

    it('returns 404 for non-member business', async () => {
      const { sessionId: ownerSession, business } = await createOwnerWithBusiness();
      const customer = await createCustomer(ownerSession, business.id);
      const created = await createDraftWithItems(ownerSession, business.id, customer.id);

      const { sessionId: otherSession } = await setupNonMemberScenario();

      const res = await getInvoice(otherSession, business.id, created.invoice.id);

      expect(res.statusCode).toBe(404);
    });
  });

  // ── PATCH ──

  describe('PATCH /businesses/:businessId/invoices/:invoiceId', () => {
    it('updates draft fields', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const { invoice } = await createDraftWithItems(
        sessionId,
        business.id,
        (await createCustomer(sessionId, business.id)).id
      );

      const res = await patchInvoice(sessionId, business.id, invoice.id, {
        notes: 'Updated note',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as InvoiceResponse;
      expect(body.invoice.notes).toBe('Updated note');
    });

    it('replaces items on update', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const customer = await createCustomer(sessionId, business.id);
      const { invoice } = await createDraftWithItems(sessionId, business.id, customer.id);

      const res = await patchInvoice(sessionId, business.id, invoice.id, {
        items: [
          {
            description: 'New Item A',
            quantity: 3,
            unitPriceAgora: 2000,
            discountPercent: 0,
            vatRateBasisPoints: 1700,
            position: 0,
          },
          {
            description: 'New Item B',
            quantity: 1,
            unitPriceAgora: 1000,
            discountPercent: 0,
            vatRateBasisPoints: 1700,
            position: 1,
          },
        ],
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as InvoiceResponse;
      expect(body.items).toHaveLength(2);
      expect(body.items[0]?.description).toBe('New Item A');
    });

    it('rejects update on non-draft invoice (422)', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const customer = await createCustomer(sessionId, business.id);
      const { invoice } = await createDraftWithItems(sessionId, business.id, customer.id);

      await finalizeInvoice(sessionId, business.id, invoice.id);

      const res = await patchInvoice(sessionId, business.id, invoice.id, {
        notes: 'Should fail',
      });

      expect(res.statusCode).toBe(422);
      expect((res.json() as { error: string }).error).toBe('not_draft');
    });
  });

  // ── DELETE ──

  describe('DELETE /businesses/:businessId/invoices/:invoiceId', () => {
    it('deletes a draft invoice', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const { invoice } = await createDraftWithItems(
        sessionId,
        business.id,
        (await createCustomer(sessionId, business.id)).id
      );

      const res = await deleteInvoice(sessionId, business.id, invoice.id);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true });

      const getRes = await getInvoice(sessionId, business.id, invoice.id);
      expect(getRes.statusCode).toBe(404);
    });

    it('rejects deletion of non-draft invoice (422)', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const customer = await createCustomer(sessionId, business.id);
      const { invoice } = await createDraftWithItems(sessionId, business.id, customer.id);

      await finalizeInvoice(sessionId, business.id, invoice.id);

      const res = await deleteInvoice(sessionId, business.id, invoice.id);

      expect(res.statusCode).toBe(422);
      expect((res.json() as { error: string }).error).toBe('not_draft');
    });
  });

  // ── FINALIZE ──

  describe('POST /businesses/:businessId/invoices/:invoiceId/finalize', () => {
    it('finalizes a draft with number assignment and customer snapshot', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const customer = await createCustomer(sessionId, business.id, {
        name: 'Acme Corp',
        email: 'acme@example.com',
        city: 'Tel Aviv',
        streetAddress: 'Rothschild 1',
      });
      const { invoice } = await createDraftWithItems(sessionId, business.id, customer.id);

      const res = await finalizeInvoice(sessionId, business.id, invoice.id);

      expect(res.statusCode).toBe(200);
      const body = res.json() as InvoiceResponse;
      expect(body.invoice.status).toBe('finalized');
      expect(body.invoice.sequenceNumber).toBeGreaterThanOrEqual(1);
      expect(body.invoice.fullNumber).toBeTruthy();
      expect(body.invoice.issuedAt).toBeTruthy();
      expect(body.invoice.customerName).toBe('Acme Corp');
      expect(body.invoice.customerEmail).toBe('acme@example.com');
      expect(body.invoice.customerAddress).toContain('Rothschild 1');
      expect(body.invoice.totalInclVatAgora).toBeGreaterThan(0);
    });

    it('rejects finalization without customer (422)', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const createRes = await postInvoice(sessionId, business.id, {
        documentType: 'tax_invoice',
        items: [
          {
            description: 'Item',
            quantity: 1,
            unitPriceAgora: 1000,
            discountPercent: 0,
            vatRateBasisPoints: 1700,
            position: 0,
          },
        ],
      });
      const { invoice } = createRes.json() as InvoiceResponse;

      const res = await finalizeInvoice(sessionId, business.id, invoice.id);

      expect(res.statusCode).toBe(422);
      expect((res.json() as { error: string }).error).toBe('missing_customer');
    });

    it('rejects finalization without line items (422)', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const customer = await createCustomer(sessionId, business.id);

      const createRes = await postInvoice(sessionId, business.id, {
        documentType: 'tax_invoice',
        customerId: customer.id,
      });
      const { invoice } = createRes.json() as InvoiceResponse;

      const res = await finalizeInvoice(sessionId, business.id, invoice.id);

      expect(res.statusCode).toBe(422);
      expect((res.json() as { error: string }).error).toBe('no_line_items');
    });

    it('rejects finalization with inactive customer (422)', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const customer = await createCustomer(sessionId, business.id);

      // Deactivate customer
      await injectAuthed(ctx.app, sessionId, {
        method: 'DELETE',
        url: `/businesses/${business.id}/customers/${customer.id}`,
      });

      const { invoice } = await createDraftWithItems(sessionId, business.id, customer.id);

      const res = await finalizeInvoice(sessionId, business.id, invoice.id);

      expect(res.statusCode).toBe(422);
      expect((res.json() as { error: string }).error).toBe('customer_inactive');
    });

    it('rejects finalization with invalid VAT rate for exempt dealer (422)', async () => {
      const { user, sessionId } = await createAuthedUser();
      const business = await createTestBusiness(user.id, { businessType: 'exempt_dealer' });
      await addUserToBusiness(user.id, business.id, 'owner');

      const customer = await createCustomer(sessionId, business.id);
      const { invoice } = await createDraftWithItems(sessionId, business.id, customer.id, [
        {
          description: 'Item',
          quantity: 1,
          unitPriceAgora: 1000,
          discountPercent: 0,
          vatRateBasisPoints: 1700, // wrong for exempt dealer
          position: 0,
        },
      ]);

      const res = await finalizeInvoice(sessionId, business.id, invoice.id);

      expect(res.statusCode).toBe(422);
      expect((res.json() as { error: string }).error).toBe('invalid_vat_rate');
    });

    it('rejects finalization with future invoice date >7 days (422)', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const customer = await createCustomer(sessionId, business.id);
      const { invoice } = await createDraftWithItems(sessionId, business.id, customer.id);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      const res = await finalizeInvoice(sessionId, business.id, invoice.id, {
        invoiceDate: futureDateStr,
      });

      expect(res.statusCode).toBe(422);
      expect((res.json() as { error: string }).error).toBe('invalid_invoice_date');
    });

    it('assigns sequential numbers at finalization time, not creation time', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const customer = await createCustomer(sessionId, business.id);

      const draft1 = await createDraftWithItems(sessionId, business.id, customer.id);
      const draft2 = await createDraftWithItems(sessionId, business.id, customer.id);

      // Finalize in reverse creation order to prove sequencing is at finalization time
      const res2 = await finalizeInvoice(sessionId, business.id, draft2.invoice.id);
      const res1 = await finalizeInvoice(sessionId, business.id, draft1.invoice.id);

      const body2 = res2.json() as InvoiceResponse;
      const body1 = res1.json() as InvoiceResponse;

      expect(body2.invoice.sequenceNumber).toBe(1);
      expect(body1.invoice.sequenceNumber).toBe(2);
    });
  });
});
