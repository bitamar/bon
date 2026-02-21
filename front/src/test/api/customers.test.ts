import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchCustomers,
  fetchCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '../../api/customers';
import { HttpError } from '../../lib/http';

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

const BIZ_ID = '00000000-0000-4000-8000-000000000001';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000002';

const minimalCustomer = {
  id: CUSTOMER_ID,
  businessId: BIZ_ID,
  name: 'Test Customer',
  taxId: null,
  taxIdType: 'none',
  isLicensedDealer: false,
  email: null,
  phone: null,
  streetAddress: null,
  city: null,
  postalCode: null,
  contactName: null,
  notes: null,
  isActive: true,
  deletedAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const minimalCustomerResponse = { customer: minimalCustomer };

const minimalCustomerListItem = {
  id: CUSTOMER_ID,
  name: 'Test Customer',
  taxId: null,
  taxIdType: 'none',
  isLicensedDealer: false,
  city: null,
  email: null,
  streetAddress: null,
  isActive: true,
};

const minimalCustomerListResponse = { customers: [minimalCustomerListItem] };

describe('customers api', () => {
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

  describe('fetchCustomers', () => {
    it('calls GET /businesses/:businessId/customers without query params', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(minimalCustomerListResponse),
      });

      const result = await fetchCustomers(BIZ_ID);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/customers`,
        expect.objectContaining({ credentials: 'include' })
      );
      expect(result).toMatchObject(minimalCustomerListResponse);
    });

    it('calls GET with all query params when provided', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(minimalCustomerListResponse),
      });

      await fetchCustomers(BIZ_ID, 'test', 'false', 10);

      const call = fetchMock.mock.calls[0];
      if (!call) throw new Error('Expected fetch to be called');
      const [url] = call as [string, RequestInit];
      expect(url).toContain('q=test');
      expect(url).toContain('active=false');
      expect(url).toContain('limit=10');
    });

    it('throws HttpError when request fails', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValueOnce({ message: 'Unauthorized' }),
      });

      await expect(fetchCustomers(BIZ_ID)).rejects.toBeInstanceOf(HttpError);
    });
  });

  describe('fetchCustomer', () => {
    it('calls GET /businesses/:businessId/customers/:customerId and returns CustomerResponse', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(minimalCustomerResponse),
      });

      const result = await fetchCustomer(BIZ_ID, CUSTOMER_ID);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/customers/${CUSTOMER_ID}`,
        expect.objectContaining({ credentials: 'include' })
      );
      expect(result).toMatchObject(minimalCustomerResponse);
    });
  });

  describe('createCustomer', () => {
    it('calls POST /businesses/:businessId/customers with correct body and returns CustomerResponse', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValueOnce(minimalCustomerResponse),
      });

      const payload = { name: 'Test Customer' };

      const result = await createCustomer(BIZ_ID, payload);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/customers`,
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );

      const call = fetchMock.mock.calls[0];
      if (!call) throw new Error('Expected fetch to be called');
      const [, init] = call as [string, RequestInit];
      expect(JSON.parse((init.body as string) ?? '')).toMatchObject(payload);
      expect(result).toMatchObject(minimalCustomerResponse);
    });
  });

  describe('updateCustomer', () => {
    it('calls PATCH /businesses/:businessId/customers/:customerId with correct body and returns CustomerResponse', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(minimalCustomerResponse),
      });

      const payload = { name: 'Updated Name' };

      const result = await updateCustomer(BIZ_ID, CUSTOMER_ID, payload);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/customers/${CUSTOMER_ID}`,
        expect.objectContaining({ method: 'PATCH', credentials: 'include' })
      );

      const call = fetchMock.mock.calls[0];
      if (!call) throw new Error('Expected fetch to be called');
      const [, init] = call as [string, RequestInit];
      expect(JSON.parse((init.body as string) ?? '')).toMatchObject(payload);
      expect(result).toMatchObject(minimalCustomerResponse);
    });
  });

  describe('deleteCustomer', () => {
    it('calls DELETE /businesses/:businessId/customers/:customerId and returns ok', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({ ok: true }),
      });

      const result = await deleteCustomer(BIZ_ID, CUSTOMER_ID);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/customers/${CUSTOMER_ID}`,
        expect.objectContaining({ method: 'DELETE', credentials: 'include' })
      );
      expect(result).toEqual({ ok: true });
    });
  });
});
