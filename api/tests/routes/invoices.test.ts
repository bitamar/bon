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
import type { InvoiceListItem, InvoiceResponse } from '@bon/types/invoices';

// ── module-level helpers ──

async function setupNonMemberScenario() {
  const { sessionId } = await createAuthedUser();
  const ownerUser = await createUser();
  const business = await createTestBusiness(ownerUser.id);
  return { sessionId, business };
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

function makeItem(overrides: Partial<TestItem> = {}): TestItem {
  return { ...DEFAULT_ITEM, ...overrides };
}

function zeroVatItem() {
  return makeItem({ description: 'Export item', vatRateBasisPoints: 0 });
}

function expectError(
  res: { statusCode: number; json: () => unknown },
  code: number,
  error: string
) {
  expect(res.statusCode).toBe(code);
  expect((res.json() as { error: string }).error).toBe(error);
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
      items: items ?? [makeItem()],
    });
    return res.json() as InvoiceResponse;
  }

  /** Owner + business + customer + draft invoice with default items. */
  async function setupOwnerDraft(items?: object[]) {
    const { sessionId, business } = await createOwnerWithBusiness();
    const customer = await createCustomer(sessionId, business.id);
    const { invoice } = await createDraftWithItems(sessionId, business.id, customer.id, items);
    return { sessionId, business, customer, invoice };
  }

  /** Owner + business + customer + draft invoice, then finalized. */
  async function setupFinalizedInvoice() {
    const ctx = await setupOwnerDraft();
    await finalizeInvoice(ctx.sessionId, ctx.business.id, ctx.invoice.id);
    return ctx;
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
          makeItem({
            description: 'Widget',
            quantity: 2,
            unitPriceMinorUnits: 5000,
            discountPercent: 10,
          }),
        ],
      });

      expect(res.statusCode).toBe(201);
      const body = res.json() as InvoiceResponse;
      expect(body.items).toHaveLength(1);
      expect(body.items[0]?.description).toBe('Widget');
      expect(body.items[0]?.quantity).toBe(2);
      expect(body.invoice.totalInclVatMinorUnits).toBeGreaterThan(0);
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
      const { sessionId, business, invoice } = await setupOwnerDraft();

      const res = await getInvoice(sessionId, business.id, invoice.id);

      expect(res.statusCode).toBe(200);
      const body = res.json() as InvoiceResponse;
      expect(body.invoice.id).toBe(invoice.id);
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
      const { sessionId, business, invoice } = await setupOwnerDraft();

      const res = await patchInvoice(sessionId, business.id, invoice.id, {
        notes: 'Updated note',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as InvoiceResponse;
      expect(body.invoice.notes).toBe('Updated note');
    });

    it('replaces items on update', async () => {
      const { sessionId, business, invoice } = await setupOwnerDraft();

      const res = await patchInvoice(sessionId, business.id, invoice.id, {
        items: [
          makeItem({ description: 'New Item A', quantity: 3, unitPriceMinorUnits: 2000 }),
          makeItem({ description: 'New Item B', unitPriceMinorUnits: 1000, position: 1 }),
        ],
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as InvoiceResponse;
      expect(body.items).toHaveLength(2);
      expect(body.items[0]?.description).toBe('New Item A');
    });

    it('rejects update on non-draft invoice (422)', async () => {
      const { sessionId, business, invoice } = await setupFinalizedInvoice();

      const res = await patchInvoice(sessionId, business.id, invoice.id, {
        notes: 'Should fail',
      });

      expectError(res, 422, 'not_draft');
    });
  });

  // ── DELETE ──

  describe('DELETE /businesses/:businessId/invoices/:invoiceId', () => {
    it('deletes a draft invoice', async () => {
      const { sessionId, business, invoice } = await setupOwnerDraft();

      const res = await deleteInvoice(sessionId, business.id, invoice.id);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true });

      const getRes = await getInvoice(sessionId, business.id, invoice.id);
      expect(getRes.statusCode).toBe(404);
    });

    it('rejects deletion of non-draft invoice (422)', async () => {
      const { sessionId, business, invoice } = await setupFinalizedInvoice();

      const res = await deleteInvoice(sessionId, business.id, invoice.id);

      expectError(res, 422, 'not_draft');
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
      expect(body.invoice.documentNumber).toBeTruthy();
      expect(body.invoice.issuedAt).toBeTruthy();
      expect(body.invoice.customerName).toBe('Acme Corp');
      expect(body.invoice.customerEmail).toBe('acme@example.com');
      expect(body.invoice.customerAddress).toContain('Rothschild 1');
      expect(body.invoice.totalInclVatMinorUnits).toBeGreaterThan(0);
    });

    it('rejects finalization without customer (422)', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const createRes = await postInvoice(sessionId, business.id, {
        documentType: 'tax_invoice',
        items: [makeItem({ description: 'Item', unitPriceMinorUnits: 1000 })],
      });
      const { invoice } = createRes.json() as InvoiceResponse;

      const res = await finalizeInvoice(sessionId, business.id, invoice.id);

      expectError(res, 422, 'missing_customer');
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

      expectError(res, 422, 'no_line_items');
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

      expectError(res, 422, 'customer_inactive');
    });

    it('rejects finalization with invalid VAT rate for exempt dealer (422)', async () => {
      const { user, sessionId } = await createAuthedUser();
      const business = await createTestBusiness(user.id, { businessType: 'exempt_dealer' });
      await addUserToBusiness(user.id, business.id, 'owner');

      const customer = await createCustomer(sessionId, business.id);
      const { invoice } = await createDraftWithItems(sessionId, business.id, customer.id, [
        makeItem({ unitPriceMinorUnits: 1000 }), // 17% VAT — wrong for exempt dealer
      ]);

      const res = await finalizeInvoice(sessionId, business.id, invoice.id);

      expectError(res, 422, 'invalid_vat_rate');
    });

    it('rejects finalization with future invoice date >7 days (422)', async () => {
      const { sessionId, business, invoice } = await setupOwnerDraft();

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      const res = await finalizeInvoice(sessionId, business.id, invoice.id, {
        invoiceDate: futureDateStr,
      });

      expectError(res, 422, 'invalid_invoice_date');
    });

    it('finalizes 0% VAT invoice with vatExemptionReason on non-exempt business', async () => {
      const { sessionId, business, invoice } = await setupOwnerDraft([zeroVatItem()]);

      const res = await finalizeInvoice(sessionId, business.id, invoice.id, {
        vatExemptionReason: 'Export transaction',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as InvoiceResponse;
      expect(body.invoice.status).toBe('finalized');
      expect(body.invoice.vatExemptionReason).toBe('Export transaction');
    });

    it('rejects 0% VAT finalization without vatExemptionReason on non-exempt business (422)', async () => {
      const { sessionId, business, invoice } = await setupOwnerDraft([zeroVatItem()]);

      const res = await finalizeInvoice(sessionId, business.id, invoice.id);

      expectError(res, 422, 'missing_vat_exemption_reason');
    });

    it('stores vatExemptionReason on standard VAT invoice without error', async () => {
      const { sessionId, business, invoice } = await setupOwnerDraft();

      const res = await finalizeInvoice(sessionId, business.id, invoice.id, {
        vatExemptionReason: 'Not actually needed',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as InvoiceResponse;
      expect(body.invoice.status).toBe('finalized');
      expect(body.invoice.vatExemptionReason).toBe('Not actually needed');
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

  // ── GET LIST ──

  describe('GET /businesses/:businessId/invoices', () => {
    // ── helpers ──

    async function listInvoicesReq(sessionId: string, businessId: string, query?: string) {
      return injectAuthed(ctx.app, sessionId, {
        method: 'GET',
        url: `/businesses/${businessId}/invoices${query ? `?${query}` : ''}`,
      });
    }

    async function setupOwnerWithTwoDrafts() {
      const { sessionId, business } = await createOwnerWithBusiness();
      const customer = await createCustomer(sessionId, business.id);
      const first = await createDraftWithItems(sessionId, business.id, customer.id);
      const second = await createDraftWithItems(sessionId, business.id, customer.id);
      return { sessionId, business, customer, first, second };
    }

    it('returns empty list when no invoices exist', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await listInvoicesReq(sessionId, business.id);

      expect(res.statusCode).toBe(200);
      const body = res.json() as { invoices: InvoiceListItem[]; total: number };
      expect(body.invoices).toHaveLength(0);
      expect(body.total).toBe(0);
    });

    it('returns invoices with correct shape', async () => {
      const { sessionId, business, customer, first } = await setupOwnerWithTwoDrafts();

      const res = await listInvoicesReq(sessionId, business.id);

      expect(res.statusCode).toBe(200);
      const body = res.json() as { invoices: InvoiceListItem[]; total: number };
      expect(body.total).toBe(2);
      expect(body.invoices).toHaveLength(2);

      const item = body.invoices.find((inv) => inv.id === first.invoice.id);
      expect(item).toBeDefined();
      expect(item?.businessId).toBe(business.id);
      expect(item?.customerId).toBe(customer.id);
      expect(item?.documentType).toBe('tax_invoice');
      expect(item?.status).toBe('draft');
      expect(item?.isOverdue).toBe(false);
      expect(item?.invoiceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(item?.totalInclVatMinorUnits).toBeGreaterThanOrEqual(0);
      expect(item?.currency).toBe('ILS');
      expect(item?.createdAt).toBeTruthy();
    });

    it('filters by a single status', async () => {
      const { sessionId, business, customer } = await setupOwnerWithTwoDrafts();
      const { invoice: draftInvoice } = await createDraftWithItems(
        sessionId,
        business.id,
        customer.id
      );
      await finalizeInvoice(sessionId, business.id, draftInvoice.id);

      const res = await listInvoicesReq(sessionId, business.id, 'status=draft');

      expect(res.statusCode).toBe(200);
      const body = res.json() as { invoices: InvoiceListItem[]; total: number };
      expect(body.invoices.every((inv) => inv.status === 'draft')).toBe(true);
      expect(body.total).toBe(2);
    });

    it('filters by multiple statuses', async () => {
      const { sessionId, business, customer } = await setupOwnerWithTwoDrafts();
      const { invoice: toFinalize } = await createDraftWithItems(
        sessionId,
        business.id,
        customer.id
      );
      await finalizeInvoice(sessionId, business.id, toFinalize.id);

      const res = await listInvoicesReq(sessionId, business.id, 'status=draft,finalized');

      expect(res.statusCode).toBe(200);
      const body = res.json() as { invoices: InvoiceListItem[]; total: number };
      expect(body.total).toBe(3);
      expect(body.invoices.some((inv) => inv.status === 'draft')).toBe(true);
      expect(body.invoices.some((inv) => inv.status === 'finalized')).toBe(true);
    });

    it('filters by customerId', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const customerA = await createCustomer(sessionId, business.id, { name: 'Customer A' });
      const customerB = await createCustomer(sessionId, business.id, { name: 'Customer B' });
      const { invoice: invoiceA } = await createDraftWithItems(
        sessionId,
        business.id,
        customerA.id
      );
      await createDraftWithItems(sessionId, business.id, customerB.id);

      const res = await listInvoicesReq(sessionId, business.id, `customerId=${customerA.id}`);

      expect(res.statusCode).toBe(200);
      const body = res.json() as { invoices: InvoiceListItem[]; total: number };
      expect(body.total).toBe(1);
      expect(body.invoices[0]?.id).toBe(invoiceA.id);
      expect(body.invoices[0]?.customerId).toBe(customerA.id);
    });

    it('filters by date range', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const customer = await createCustomer(sessionId, business.id);

      const earlyRes = await postInvoice(sessionId, business.id, {
        documentType: 'tax_invoice',
        customerId: customer.id,
        items: [makeItem()],
        invoiceDate: '2026-01-10',
      });
      const { invoice: earlyInvoice } = earlyRes.json() as InvoiceResponse;

      await postInvoice(sessionId, business.id, {
        documentType: 'tax_invoice',
        customerId: customer.id,
        items: [makeItem()],
        invoiceDate: '2026-03-15',
      });

      const res = await listInvoicesReq(
        sessionId,
        business.id,
        'dateFrom=2026-01-01&dateTo=2026-01-31'
      );

      expect(res.statusCode).toBe(200);
      const body = res.json() as { invoices: InvoiceListItem[]; total: number };
      expect(body.total).toBe(1);
      expect(body.invoices[0]?.id).toBe(earlyInvoice.id);
    });

    it('returns 400 when dateFrom is after dateTo', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await listInvoicesReq(
        sessionId,
        business.id,
        'dateFrom=2026-03-01&dateTo=2026-01-01'
      );

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for an invalid sort value', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      const res = await listInvoicesReq(sessionId, business.id, 'sort=invalid');

      expect(res.statusCode).toBe(400);
    });

    it('paginates results correctly', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const customer = await createCustomer(sessionId, business.id);
      await createDraftWithItems(sessionId, business.id, customer.id);
      await createDraftWithItems(sessionId, business.id, customer.id);
      await createDraftWithItems(sessionId, business.id, customer.id);

      const page1Res = await listInvoicesReq(sessionId, business.id, 'limit=2&page=1');
      expect(page1Res.statusCode).toBe(200);
      const page1 = page1Res.json() as { invoices: InvoiceListItem[]; total: number };
      expect(page1.invoices).toHaveLength(2);
      expect(page1.total).toBe(3);

      const page2Res = await listInvoicesReq(sessionId, business.id, 'limit=2&page=2');
      expect(page2Res.statusCode).toBe(200);
      const page2 = page2Res.json() as { invoices: InvoiceListItem[]; total: number };
      expect(page2.invoices).toHaveLength(1);
      expect(page2.total).toBe(3);
    });

    it('returns 404 for a non-member business', async () => {
      const { sessionId, business } = await setupNonMemberScenario();

      const res = await listInvoicesReq(sessionId, business.id);

      expect(res.statusCode).toBe(404);
    });
  });
});
