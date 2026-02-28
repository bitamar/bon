import { fetchJson } from '../lib/http';
import {
  invoiceListResponseSchema,
  invoiceResponseSchema,
  type CreateInvoiceDraftBody,
  type FinalizeInvoiceBody,
  type InvoiceListResponse,
  type InvoiceResponse,
  type UpdateInvoiceDraftBody,
} from '@bon/types/invoices';
import { okResponseSchema } from '@bon/types/common';

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
