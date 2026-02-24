import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInvoiceDraft,
  fetchInvoice,
  updateInvoiceDraft,
  deleteInvoiceDraft,
} from '../../api/invoices';
import { HttpError } from '../../lib/http';

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

const BIZ_ID = '00000000-0000-4000-8000-000000000001';
const INV_ID = '00000000-0000-4000-8000-000000000002';

const minimalInvoice = {
  id: INV_ID,
  businessId: BIZ_ID,
  customerId: null,
  customerName: null,
  customerTaxId: null,
  customerAddress: null,
  customerEmail: null,
  documentType: 'tax_invoice',
  status: 'draft',
  isOverdue: false,
  sequenceGroup: null,
  sequenceNumber: null,
  fullNumber: null,
  creditedInvoiceId: null,
  invoiceDate: '2024-01-01',
  issuedAt: null,
  dueDate: null,
  notes: null,
  internalNotes: null,
  currency: 'ILS',
  vatExemptionReason: null,
  subtotalAgora: 0,
  discountAgora: 0,
  totalExclVatAgora: 0,
  vatAgora: 0,
  totalInclVatAgora: 0,
  allocationStatus: null,
  allocationNumber: null,
  allocationError: null,
  sentAt: null,
  paidAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const minimalInvoiceResponse = { invoice: minimalInvoice, items: [] };

describe('invoices api', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterAll(() => {
    fetchMock.mockReset();
  });

  // ── helpers ──

  function mockOk(body: unknown, status = 200) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status,
      json: vi.fn().mockResolvedValueOnce(body),
    });
  }

  function mockFail(status: number) {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status,
      json: vi.fn().mockResolvedValueOnce({ message: 'error' }),
    });
  }

  describe('createInvoiceDraft', () => {
    it('calls POST with correct body and returns InvoiceResponse', async () => {
      mockOk(minimalInvoiceResponse, 201);

      const payload = { documentType: 'tax_invoice' as const };
      const result = await createInvoiceDraft(BIZ_ID, payload);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/invoices`,
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
      expect(result).toMatchObject(minimalInvoiceResponse);
    });

    it('throws HttpError on failure', async () => {
      mockFail(422);
      await expect(
        createInvoiceDraft(BIZ_ID, { documentType: 'tax_invoice' })
      ).rejects.toBeInstanceOf(HttpError);
    });
  });

  describe('fetchInvoice', () => {
    it('calls GET and returns InvoiceResponse', async () => {
      mockOk(minimalInvoiceResponse);

      const result = await fetchInvoice(BIZ_ID, INV_ID);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/invoices/${INV_ID}`,
        expect.objectContaining({ credentials: 'include' })
      );
      expect(result).toMatchObject(minimalInvoiceResponse);
    });

    it('throws HttpError when not found', async () => {
      mockFail(404);
      await expect(fetchInvoice(BIZ_ID, INV_ID)).rejects.toBeInstanceOf(HttpError);
    });
  });

  describe('updateInvoiceDraft', () => {
    it('calls PATCH with correct body and returns InvoiceResponse', async () => {
      mockOk(minimalInvoiceResponse);

      const payload = { notes: 'Updated notes' };
      const result = await updateInvoiceDraft(BIZ_ID, INV_ID, payload);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/invoices/${INV_ID}`,
        expect.objectContaining({ method: 'PATCH', credentials: 'include' })
      );
      expect(result).toMatchObject(minimalInvoiceResponse);
    });
  });

  describe('deleteInvoiceDraft', () => {
    it('calls DELETE and returns ok', async () => {
      mockOk({ ok: true });

      const result = await deleteInvoiceDraft(BIZ_ID, INV_ID);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/invoices/${INV_ID}`,
        expect.objectContaining({ method: 'DELETE', credentials: 'include' })
      );
      expect(result).toEqual({ ok: true });
    });
  });
});
