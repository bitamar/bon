import { fetchJson, fetchBlob } from '../lib/http';
import {
  invoiceListResponseSchema,
  invoiceResponseSchema,
  sendInvoiceResponseSchema,
  type CreateCreditNoteBody,
  type CreateInvoiceDraftBody,
  type FinalizeInvoiceBody,
  type InvoiceListResponse,
  type InvoiceResponse,
  type SendInvoiceBody,
  type SendInvoiceResponse,
  type UpdateInvoiceDraftBody,
} from '@bon/types/invoices';
import { okResponseSchema } from '@bon/types/common';
import type { RecordPaymentBody } from '@bon/types/payments';

export async function fetchInvoices(
  businessId: string,
  params: Record<string, string>
): Promise<InvoiceListResponse> {
  const qs = new URLSearchParams(params).toString();
  const basePath = `/businesses/${businessId}/invoices`;
  const json = await fetchJson<unknown>(qs ? `${basePath}?${qs}` : basePath);
  return invoiceListResponseSchema.parse(json);
}

export async function createInvoiceDraft(
  businessId: string,
  data: CreateInvoiceDraftBody
): Promise<InvoiceResponse> {
  const json = await fetchJson<unknown>(`/businesses/${businessId}/invoices`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return invoiceResponseSchema.parse(json);
}

export async function fetchInvoice(
  businessId: string,
  invoiceId: string
): Promise<InvoiceResponse> {
  const json = await fetchJson<unknown>(`/businesses/${businessId}/invoices/${invoiceId}`);
  return invoiceResponseSchema.parse(json);
}

export async function updateInvoiceDraft(
  businessId: string,
  invoiceId: string,
  data: UpdateInvoiceDraftBody
): Promise<InvoiceResponse> {
  const json = await fetchJson<unknown>(`/businesses/${businessId}/invoices/${invoiceId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return invoiceResponseSchema.parse(json);
}

export async function deleteInvoiceDraft(
  businessId: string,
  invoiceId: string
): Promise<{ ok: true }> {
  const json = await fetchJson<unknown>(`/businesses/${businessId}/invoices/${invoiceId}`, {
    method: 'DELETE',
  });
  return okResponseSchema.parse(json);
}

export async function finalizeInvoice(
  businessId: string,
  invoiceId: string,
  data: FinalizeInvoiceBody
): Promise<InvoiceResponse> {
  const json = await fetchJson<unknown>(
    `/businesses/${businessId}/invoices/${invoiceId}/finalize`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
  return invoiceResponseSchema.parse(json);
}

export async function sendInvoiceByEmail(
  businessId: string,
  invoiceId: string,
  data: SendInvoiceBody
): Promise<SendInvoiceResponse> {
  const json = await fetchJson<unknown>(`/businesses/${businessId}/invoices/${invoiceId}/send`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return sendInvoiceResponseSchema.parse(json);
}

export async function createCreditNote(
  businessId: string,
  invoiceId: string,
  data: CreateCreditNoteBody
): Promise<InvoiceResponse> {
  const json = await fetchJson<unknown>(
    `/businesses/${businessId}/invoices/${invoiceId}/credit-note`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
  return invoiceResponseSchema.parse(json);
}

export async function recordPayment(
  businessId: string,
  invoiceId: string,
  data: RecordPaymentBody
): Promise<InvoiceResponse> {
  const json = await fetchJson<unknown>(
    `/businesses/${businessId}/invoices/${invoiceId}/payments`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
  return invoiceResponseSchema.parse(json);
}

export async function downloadInvoicePdf(businessId: string, invoiceId: string): Promise<void> {
  const response = await fetchBlob(`/businesses/${businessId}/invoices/${invoiceId}/pdf`);
  const blob = await response.blob();

  const disposition = response.headers.get('Content-Disposition');
  const filenameMatch = disposition?.match(/filename="(.+)"/);
  const filename = filenameMatch?.[1] ?? `invoice-${invoiceId}.pdf`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function deletePayment(
  businessId: string,
  invoiceId: string,
  paymentId: string
): Promise<InvoiceResponse> {
  const json = await fetchJson<unknown>(
    `/businesses/${businessId}/invoices/${invoiceId}/payments/${paymentId}`,
    {
      method: 'DELETE',
    }
  );
  return invoiceResponseSchema.parse(json);
}
