import { fetchJson } from '../lib/http';
import {
  customerListResponseSchema,
  customerResponseSchema,
  type CreateCustomerBody,
  type CustomerListResponse,
  type CustomerResponse,
  type UpdateCustomerBody,
} from '@bon/types/customers';
import { okResponseSchema } from '@bon/types/common';

export async function fetchCustomers(
  businessId: string,
  q?: string,
  active?: 'false',
  limit?: number
): Promise<CustomerListResponse> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (active) params.set('active', active);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  const basePath = `/businesses/${businessId}/customers`;
  const json = await fetchJson<unknown>(qs ? `${basePath}?${qs}` : basePath);
  return customerListResponseSchema.parse(json);
}

export async function fetchCustomer(
  businessId: string,
  customerId: string
): Promise<CustomerResponse> {
  const json = await fetchJson<unknown>(`/businesses/${businessId}/customers/${customerId}`);
  return customerResponseSchema.parse(json);
}

export async function createCustomer(
  businessId: string,
  data: CreateCustomerBody
): Promise<CustomerResponse> {
  const json = await fetchJson<unknown>(`/businesses/${businessId}/customers`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return customerResponseSchema.parse(json);
}

export async function updateCustomer(
  businessId: string,
  customerId: string,
  data: UpdateCustomerBody
): Promise<CustomerResponse> {
  const json = await fetchJson<unknown>(`/businesses/${businessId}/customers/${customerId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return customerResponseSchema.parse(json);
}

export async function deleteCustomer(
  businessId: string,
  customerId: string
): Promise<{ ok: true }> {
  const json = await fetchJson<unknown>(`/businesses/${businessId}/customers/${customerId}`, {
    method: 'DELETE',
  });
  return okResponseSchema.parse(json);
}
