import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBusiness,
  fetchBusiness,
  fetchBusinesses,
  fetchTeamMembers,
  removeTeamMember,
  updateBusiness,
} from '../../api/businesses';
import { HttpError } from '../../lib/http';

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

const BIZ_ID = 'biz-0000-0000-0000-000000000001';
const USER_ID = 'usr-0000-0000-0000-000000000001';

const minimalBusiness = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Test Business',
  businessType: 'licensed_dealer',
  registrationNumber: '123456789',
  vatNumber: null,
  streetAddress: '1 Main St',
  city: 'Tel Aviv',
  postalCode: null,
  phone: null,
  email: null,
  invoiceNumberPrefix: null,
  startingInvoiceNumber: 1,
  defaultVatRate: 1700,
  logoUrl: null,
  isActive: true,
  createdByUserId: '00000000-0000-4000-8000-000000000002',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const minimalBusinessResponse = {
  business: minimalBusiness,
  role: 'owner',
};

const minimalBusinessListResponse = {
  businesses: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Test Business',
      businessType: 'licensed_dealer',
      registrationNumber: '123456789',
      isActive: true,
      role: 'owner',
    },
  ],
};

const minimalTeamListResponse = {
  team: [
    {
      userId: '00000000-0000-4000-8000-000000000003',
      name: 'Alice',
      email: 'alice@example.com',
      avatarUrl: null,
      role: 'owner',
      joinedAt: '2024-01-01T00:00:00.000Z',
    },
  ],
};

describe('businesses api', () => {
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

  describe('fetchBusinesses', () => {
    it('calls GET /businesses and returns BusinessListResponse', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(minimalBusinessListResponse),
      });

      const result = await fetchBusinesses();

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses`,
        expect.objectContaining({ credentials: 'include' })
      );
      expect(result).toMatchObject(minimalBusinessListResponse);
    });

    it('throws HttpError when request fails', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValueOnce({ message: 'Unauthorized' }),
      });

      await expect(fetchBusinesses()).rejects.toBeInstanceOf(HttpError);
    });
  });

  describe('fetchBusiness', () => {
    it('calls GET /businesses/:businessId and returns BusinessResponse', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(minimalBusinessResponse),
      });

      const result = await fetchBusiness(BIZ_ID);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}`,
        expect.objectContaining({ credentials: 'include' })
      );
      expect(result).toMatchObject(minimalBusinessResponse);
    });
  });

  describe('createBusiness', () => {
    it('calls POST /businesses with correct body and returns BusinessResponse', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValueOnce(minimalBusinessResponse),
      });

      const payload = {
        name: 'Test Business',
        businessType: 'licensed_dealer' as const,
        registrationNumber: '123456789',
        streetAddress: '1 Main St',
        city: 'Tel Aviv',
      };

      const result = await createBusiness(payload);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses`,
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );

      const call = fetchMock.mock.calls[0];
      if (!call) throw new Error('Expected fetch to be called');
      const [, init] = call as [string, RequestInit];
      expect(JSON.parse((init.body as string) ?? '')).toMatchObject(payload);
      expect(result).toMatchObject(minimalBusinessResponse);
    });
  });

  describe('updateBusiness', () => {
    it('calls PATCH /businesses/:businessId with correct body and returns BusinessResponse', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(minimalBusinessResponse),
      });

      const updatePayload = { name: 'Updated Name' };

      const result = await updateBusiness(BIZ_ID, updatePayload);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}`,
        expect.objectContaining({ method: 'PATCH', credentials: 'include' })
      );

      const call = fetchMock.mock.calls[0];
      if (!call) throw new Error('Expected fetch to be called');
      const [, init] = call as [string, RequestInit];
      expect(JSON.parse((init.body as string) ?? '')).toMatchObject(updatePayload);
      expect(result).toMatchObject(minimalBusinessResponse);
    });
  });

  describe('fetchTeamMembers', () => {
    it('calls GET /businesses/:businessId/team and returns TeamListResponse', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(minimalTeamListResponse),
      });

      const result = await fetchTeamMembers(BIZ_ID);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/team`,
        expect.objectContaining({ credentials: 'include' })
      );
      expect(result).toMatchObject(minimalTeamListResponse);
    });
  });

  describe('removeTeamMember', () => {
    it('calls DELETE /businesses/:businessId/team/:userId and returns void', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: vi.fn().mockResolvedValueOnce(undefined),
      });

      const result = await removeTeamMember(BIZ_ID, USER_ID);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/team/${USER_ID}`,
        expect.objectContaining({ method: 'DELETE', credentials: 'include' })
      );
      expect(result).toBeUndefined();
    });
  });
});
