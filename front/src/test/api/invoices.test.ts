import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInvoiceDraft,
  createCreditNote,
  deleteInvoiceDraft,
  deletePayment,
  downloadInvoicePdf,
  fetchInvoice,
  fetchInvoices,
  finalizeInvoice,
  recordPayment,
  sendInvoiceByEmail,
  updateInvoiceDraft,
} from '../../api/invoices';
import { HttpError } from '../../lib/http';
import { useFetchMock } from './fetch-mock';

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
  documentNumber: null,
  creditedInvoiceId: null,
  invoiceDate: '2024-01-01',
  issuedAt: null,
  dueDate: null,
  notes: null,
  internalNotes: null,
  currency: 'ILS',
  vatExemptionReason: null,
  subtotalMinorUnits: 0,
  discountMinorUnits: 0,
  totalExclVatMinorUnits: 0,
  vatMinorUnits: 0,
  totalInclVatMinorUnits: 0,
  allocationStatus: null,
  allocationNumber: null,
  allocationError: null,
  sentAt: null,
  paidAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const minimalInvoiceResponse = {
  invoice: minimalInvoice,
  items: [],
  payments: [],
  remainingBalanceMinorUnits: 0,
};

// ── helpers ──

function setupDownloadAnchorMock(objectUrl = 'blob:http://localhost/fake-pdf-url') {
  const createObjectURL = vi.fn().mockReturnValue(objectUrl);
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

  const mockAnchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
  const createElementSpy = vi
    .spyOn(document, 'createElement')
    .mockReturnValue(mockAnchor as unknown as HTMLElement);
  const appendChildSpy = vi
    .spyOn(document.body, 'appendChild')
    .mockReturnValue(mockAnchor as unknown as Node);

  return { mockAnchor, createObjectURL, revokeObjectURL, createElementSpy, appendChildSpy };
}

describe('invoices api', () => {
  const { fetchMock, mockOk, mockFail } = useFetchMock();

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

  describe('finalizeInvoice', () => {
    it('calls POST to finalize endpoint and returns InvoiceResponse', async () => {
      mockOk(minimalInvoiceResponse);

      const payload = { invoiceDate: '2026-02-20' };
      const result = await finalizeInvoice(BIZ_ID, INV_ID, payload);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/invoices/${INV_ID}/finalize`,
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
      expect(result).toMatchObject(minimalInvoiceResponse);
    });

    it('throws HttpError on failure', async () => {
      mockFail(422);
      await expect(finalizeInvoice(BIZ_ID, INV_ID, {})).rejects.toBeInstanceOf(HttpError);
    });
  });

  describe('fetchInvoices', () => {
    const minimalListItem = {
      id: INV_ID,
      businessId: BIZ_ID,
      customerId: null,
      customerName: null,
      documentType: 'tax_invoice',
      status: 'draft',
      isOverdue: false,
      sequenceGroup: null,
      documentNumber: null,
      invoiceDate: '2024-01-01',
      dueDate: null,
      totalInclVatMinorUnits: 0,
      currency: 'ILS',
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    const listResponse = {
      invoices: [minimalListItem],
      total: 1,
      aggregates: {
        totalOutstandingMinorUnits: 0,
        countOutstanding: 0,
        totalFilteredMinorUnits: 0,
      },
    };

    it('calls GET without query string when params is empty', async () => {
      mockOk(listResponse);

      const result = await fetchInvoices(BIZ_ID, {});

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/invoices`,
        expect.objectContaining({ credentials: 'include' })
      );
      expect(result).toMatchObject(listResponse);
    });

    it('appends query params to the URL when provided', async () => {
      mockOk(listResponse);

      await fetchInvoices(BIZ_ID, { status: 'draft', page: '2' });

      const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('status=draft');
      expect(calledUrl).toContain('page=2');
    });
  });

  describe('sendInvoiceByEmail', () => {
    const sendResponse = { ok: true, sentAt: '2026-03-01T12:00:00.000Z' };

    it('calls POST to /send and returns send response', async () => {
      mockOk(sendResponse);

      const result = await sendInvoiceByEmail(BIZ_ID, INV_ID, {
        recipientEmail: 'customer@example.com',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/invoices/${INV_ID}/send`,
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
      expect(result).toEqual(sendResponse);
    });

    it('throws HttpError on failure', async () => {
      mockFail(422);
      await expect(
        sendInvoiceByEmail(BIZ_ID, INV_ID, { recipientEmail: 'customer@example.com' })
      ).rejects.toBeInstanceOf(HttpError);
    });
  });

  describe('createCreditNote', () => {
    const creditNotePayload = {
      items: [
        {
          description: 'Refund',
          quantity: 1,
          unitPriceMinorUnits: 10000,
          discountPercent: 0,
          vatRateBasisPoints: 1700,
          position: 0,
        },
      ],
    };

    it('calls POST to /credit-note and returns InvoiceResponse', async () => {
      mockOk(minimalInvoiceResponse, 201);

      const result = await createCreditNote(BIZ_ID, INV_ID, creditNotePayload);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/invoices/${INV_ID}/credit-note`,
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
      expect(result).toMatchObject(minimalInvoiceResponse);
    });

    it('throws HttpError on failure', async () => {
      mockFail(422);
      await expect(createCreditNote(BIZ_ID, INV_ID, creditNotePayload)).rejects.toBeInstanceOf(
        HttpError
      );
    });
  });

  describe('recordPayment', () => {
    const paymentPayload = {
      amountMinorUnits: 10000,
      paidAt: '2026-03-01',
      method: 'transfer' as const,
    };

    it('calls POST to /payments and returns InvoiceResponse', async () => {
      mockOk(minimalInvoiceResponse, 201);

      const result = await recordPayment(BIZ_ID, INV_ID, paymentPayload);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/invoices/${INV_ID}/payments`,
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
      expect(result).toMatchObject(minimalInvoiceResponse);
    });

    it('throws HttpError on failure', async () => {
      mockFail(422);
      await expect(recordPayment(BIZ_ID, INV_ID, paymentPayload)).rejects.toBeInstanceOf(HttpError);
    });
  });

  describe('deletePayment', () => {
    const PAY_ID = '00000000-0000-4000-8000-000000000003';

    it('calls DELETE on /payments/:paymentId and returns InvoiceResponse', async () => {
      mockOk(minimalInvoiceResponse);

      const result = await deletePayment(BIZ_ID, INV_ID, PAY_ID);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/invoices/${INV_ID}/payments/${PAY_ID}`,
        expect.objectContaining({ method: 'DELETE', credentials: 'include' })
      );
      expect(result).toMatchObject(minimalInvoiceResponse);
    });

    it('throws HttpError on failure', async () => {
      mockFail(404);
      await expect(deletePayment(BIZ_ID, INV_ID, PAY_ID)).rejects.toBeInstanceOf(HttpError);
    });
  });

  describe('downloadInvoicePdf', () => {
    const ORIGINAL_URL = globalThis.URL;

    afterEach(() => {
      globalThis.URL = ORIGINAL_URL;
    });

    it('fetches the PDF, creates a download link with the Content-Disposition filename, and revokes the object URL', async () => {
      const fakeBlob = new Blob(['%PDF'], { type: 'application/pdf' });
      const fakeObjectUrl = 'blob:http://localhost/fake-pdf-url';

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: vi.fn().mockResolvedValueOnce(fakeBlob),
        headers: { get: vi.fn().mockReturnValue('attachment; filename="invoice-001.pdf"') },
      });

      const { mockAnchor, createObjectURL, revokeObjectURL, createElementSpy, appendChildSpy } =
        setupDownloadAnchorMock(fakeObjectUrl);

      await downloadInvoicePdf(BIZ_ID, INV_ID);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/invoices/${INV_ID}/pdf`,
        expect.objectContaining({ credentials: 'include' })
      );
      expect(createObjectURL).toHaveBeenCalledWith(fakeBlob);
      expect(mockAnchor.href).toBe(fakeObjectUrl);
      expect(mockAnchor.download).toBe('invoice-001.pdf');
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(mockAnchor.remove).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith(fakeObjectUrl);

      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
    });

    it('uses a fallback filename when Content-Disposition header is absent', async () => {
      const fakeBlob = new Blob(['%PDF'], { type: 'application/pdf' });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: vi.fn().mockResolvedValueOnce(fakeBlob),
        headers: { get: vi.fn().mockReturnValue(null) },
      });

      const { mockAnchor, createElementSpy, appendChildSpy } = setupDownloadAnchorMock();

      await downloadInvoicePdf(BIZ_ID, INV_ID);

      expect(mockAnchor.download).toBe(`invoice-${INV_ID}.pdf`);

      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
    });
  });
});
