import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { injectAuthed } from '../utils/inject.js';
import {
  createOwnerWithBusiness,
  createAuthedUser,
  addUserToBusiness,
} from '../utils/businesses.js';
import { setupIntegrationTest } from '../utils/server.js';
import type { InvoiceResponse } from '@bon/types/invoices';
import type { Payment } from '@bon/types/payments';

// ── module-level helpers ──

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

function expectError(
  res: { statusCode: number; json: () => unknown },
  code: number,
  error: string
) {
  expect(res.statusCode).toBe(code);
  expect((res.json() as { error: string }).error).toBe(error);
}

describe('routes/payments', () => {
  const ctx = setupIntegrationTest();

  // ── helpers ──

  async function createCustomer(sessionId: string, businessId: string) {
    const res = await injectAuthed(ctx.app, sessionId, {
      method: 'POST',
      url: `/businesses/${businessId}/customers`,
      payload: { name: 'Test Customer' },
    });
    return (res.json() as { customer: { id: string } }).customer;
  }

  async function createDraftWithItems(
    sessionId: string,
    businessId: string,
    customerId: string,
    items?: TestItem[]
  ) {
    const res = await injectAuthed(ctx.app, sessionId, {
      method: 'POST',
      url: `/businesses/${businessId}/invoices`,
      payload: {
        documentType: 'tax_invoice',
        customerId,
        items: items ?? [makeItem()],
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

  async function setupFinalizedInvoice() {
    const { sessionId, business } = await createOwnerWithBusiness();
    const customer = await createCustomer(sessionId, business.id);
    const { invoice } = await createDraftWithItems(sessionId, business.id, customer.id);
    await finalizeInvoice(sessionId, business.id, invoice.id);
    return { sessionId, business, customer, invoice };
  }

  async function postPayment(
    sessionId: string,
    businessId: string,
    invoiceId: string,
    payload: object
  ) {
    return injectAuthed(ctx.app, sessionId, {
      method: 'POST',
      url: `/businesses/${businessId}/invoices/${invoiceId}/payments`,
      payload,
    });
  }

  async function getPayments(sessionId: string, businessId: string, invoiceId: string) {
    return injectAuthed(ctx.app, sessionId, {
      method: 'GET',
      url: `/businesses/${businessId}/invoices/${invoiceId}/payments`,
    });
  }

  async function deletePaymentReq(
    sessionId: string,
    businessId: string,
    invoiceId: string,
    paymentId: string
  ) {
    return injectAuthed(ctx.app, sessionId, {
      method: 'DELETE',
      url: `/businesses/${businessId}/invoices/${invoiceId}/payments/${paymentId}`,
    });
  }

  function makePaymentPayload(
    overrides: { amountMinorUnits?: number; paidAt?: string; method?: string } = {}
  ) {
    return {
      amountMinorUnits: 11700,
      paidAt: '2026-03-10',
      method: 'cash',
      ...overrides,
    };
  }

  // ── POST payment ──

  describe('POST /businesses/:businessId/invoices/:invoiceId/payments', () => {
    it('records full payment on finalized invoice → status becomes paid', async () => {
      const { sessionId, business, invoice } = await setupFinalizedInvoice();

      const res = await postPayment(sessionId, business.id, invoice.id, makePaymentPayload());

      expect(res.statusCode).toBe(201);
      const body = res.json() as InvoiceResponse;
      expect(body.invoice.status).toBe('paid');
      expect(body.payments).toHaveLength(1);
      expect(body.remainingBalanceMinorUnits).toBe(0);
      expect(body.payments[0]!.amountMinorUnits).toBe(11700);
      expect(body.payments[0]!.method).toBe('cash');
    });

    it('records partial payment → status becomes partially_paid', async () => {
      const { sessionId, business, invoice } = await setupFinalizedInvoice();

      const res = await postPayment(
        sessionId,
        business.id,
        invoice.id,
        makePaymentPayload({ amountMinorUnits: 5000, method: 'transfer' })
      );

      expect(res.statusCode).toBe(201);
      const body = res.json() as InvoiceResponse;
      expect(body.invoice.status).toBe('partially_paid');
      expect(body.remainingBalanceMinorUnits).toBe(6700);
    });

    it('second partial payment completing balance → status becomes paid', async () => {
      const { sessionId, business, invoice } = await setupFinalizedInvoice();

      await postPayment(
        sessionId,
        business.id,
        invoice.id,
        makePaymentPayload({ amountMinorUnits: 5000 })
      );

      const res = await postPayment(
        sessionId,
        business.id,
        invoice.id,
        makePaymentPayload({ amountMinorUnits: 6700, paidAt: '2026-03-11', method: 'credit' })
      );

      expect(res.statusCode).toBe(201);
      const body = res.json() as InvoiceResponse;
      expect(body.invoice.status).toBe('paid');
      expect(body.payments).toHaveLength(2);
      expect(body.remainingBalanceMinorUnits).toBe(0);
    });

    it('rejects payment exceeding balance → 422', async () => {
      const { sessionId, business, invoice } = await setupFinalizedInvoice();

      const res = await postPayment(
        sessionId,
        business.id,
        invoice.id,
        makePaymentPayload({ amountMinorUnits: 99999 })
      );

      expectError(res, 422, 'payment_exceeds_balance');
    });

    it('rejects payment on draft invoice → 422', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const customer = await createCustomer(sessionId, business.id);
      const { invoice } = await createDraftWithItems(sessionId, business.id, customer.id);

      const res = await postPayment(
        sessionId,
        business.id,
        invoice.id,
        makePaymentPayload({ amountMinorUnits: 5000 })
      );

      expectError(res, 422, 'invoice_not_payable');
    });

    it('user role cannot record payment → 403', async () => {
      const { business, invoice } = await setupFinalizedInvoice();
      const { user: memberUser, sessionId: memberSession } = await createAuthedUser();
      await addUserToBusiness(memberUser.id, business.id, 'user');

      const res = await postPayment(
        memberSession,
        business.id,
        invoice.id,
        makePaymentPayload({ amountMinorUnits: 5000 })
      );

      expect(res.statusCode).toBe(403);
    });
  });

  // ── GET payments ──

  describe('GET /businesses/:businessId/invoices/:invoiceId/payments', () => {
    it('returns payments sorted newest-first', async () => {
      const { sessionId, business, invoice } = await setupFinalizedInvoice();

      await postPayment(
        sessionId,
        business.id,
        invoice.id,
        makePaymentPayload({ amountMinorUnits: 3000, paidAt: '2026-03-08' })
      );
      await postPayment(
        sessionId,
        business.id,
        invoice.id,
        makePaymentPayload({ amountMinorUnits: 2000, method: 'transfer' })
      );

      const res = await getPayments(sessionId, business.id, invoice.id);
      expect(res.statusCode).toBe(200);

      const payments = res.json() as Payment[];
      expect(payments).toHaveLength(2);
      // Newest first
      expect(payments[0]!.paidAt).toBe('2026-03-10');
      expect(payments[1]!.paidAt).toBe('2026-03-08');
    });

    it('returns 404 for non-existent invoice', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const fakeInvoiceId = crypto.randomUUID();

      const res = await getPayments(sessionId, business.id, fakeInvoiceId);
      expect(res.statusCode).toBe(404);
    });

    it('non-member cannot list payments → 403', async () => {
      const { business, invoice } = await setupFinalizedInvoice();
      const { sessionId: outsiderSession } = await createAuthedUser();

      const res = await getPayments(outsiderSession, business.id, invoice.id);
      expect(res.statusCode).toBe(403);
    });
  });

  // ── DELETE payment ──

  describe('DELETE /businesses/:businessId/invoices/:invoiceId/payments/:paymentId', () => {
    it('deleting payment reverts status correctly', async () => {
      const { sessionId, business, invoice } = await setupFinalizedInvoice();

      // Record full payment
      const payRes = await postPayment(sessionId, business.id, invoice.id, makePaymentPayload());
      const payBody = payRes.json() as InvoiceResponse;
      expect(payBody.invoice.status).toBe('paid');

      const paymentId = payBody.payments[0]!.id;

      // Delete payment
      const delRes = await deletePaymentReq(sessionId, business.id, invoice.id, paymentId);
      expect(delRes.statusCode).toBe(200);

      const delBody = delRes.json() as InvoiceResponse;
      expect(delBody.invoice.status).toBe('finalized');
      expect(delBody.invoice.paidAt).toBeNull();
      expect(delBody.payments).toHaveLength(0);
      expect(delBody.remainingBalanceMinorUnits).toBe(11700);
    });

    it('returns 404 for non-existent payment', async () => {
      const { sessionId, business, invoice } = await setupFinalizedInvoice();
      const fakePaymentId = crypto.randomUUID();

      const res = await deletePaymentReq(sessionId, business.id, invoice.id, fakePaymentId);
      expect(res.statusCode).toBe(404);
    });

    it('non-member cannot delete payment → 403', async () => {
      const { sessionId, business, invoice } = await setupFinalizedInvoice();

      const payRes = await postPayment(sessionId, business.id, invoice.id, makePaymentPayload());
      const paymentId = (payRes.json() as InvoiceResponse).payments[0]!.id;

      const { sessionId: outsiderSession } = await createAuthedUser();
      const res = await deletePaymentReq(outsiderSession, business.id, invoice.id, paymentId);
      expect(res.statusCode).toBe(403);
    });
  });
});
