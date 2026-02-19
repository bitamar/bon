import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptInvitation,
  createInvitation,
  declineInvitation,
  fetchInvitations,
  fetchMyInvitations,
} from '../../api/invitations';
import { HttpError } from '../../lib/http';

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

const BIZ_ID = '00000000-0000-4000-8000-000000000001';
const INV_TOKEN = 'test-invitation-token-abc123';

const minimalInvitationListResponse = {
  invitations: [
    {
      id: '00000000-0000-4000-8000-000000000010',
      businessId: BIZ_ID,
      businessName: 'Test Business',
      email: 'a@b.com',
      role: 'user',
      status: 'pending',
      invitedByName: 'Alice',
      personalMessage: null,
      expiresAt: '2024-12-31T00:00:00.000Z',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
  ],
};

const minimalMyInvitationsResponse = {
  invitations: [
    {
      id: '00000000-0000-4000-8000-000000000010',
      businessId: BIZ_ID,
      businessName: 'Test Business',
      role: 'user',
      invitedByName: 'Alice',
      personalMessage: null,
      expiresAt: '2024-12-31T00:00:00.000Z',
      token: INV_TOKEN,
      createdAt: '2024-01-01T00:00:00.000Z',
    },
  ],
};

describe('invitations api', () => {
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

  describe('createInvitation', () => {
    it('calls POST /businesses/:businessId/invitations with correct body and returns void', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValueOnce(undefined),
      });

      const payload = { email: 'new@example.com', role: 'user' as const };

      const result = await createInvitation(BIZ_ID, payload);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/invitations`,
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );

      const call = fetchMock.mock.calls[0];
      if (!call) throw new Error('Expected fetch to be called');
      const [, init] = call as [string, RequestInit];
      expect(JSON.parse((init.body as string) ?? '')).toMatchObject(payload);
      expect(result).toBeUndefined();
    });

    it('throws HttpError when request fails', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValueOnce({ message: 'Forbidden' }),
      });

      await expect(
        createInvitation(BIZ_ID, { email: 'new@example.com', role: 'user' })
      ).rejects.toBeInstanceOf(HttpError);
    });
  });

  describe('fetchInvitations', () => {
    it('calls GET /businesses/:businessId/invitations and returns InvitationListResponse', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(minimalInvitationListResponse),
      });

      const result = await fetchInvitations(BIZ_ID);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/invitations`,
        expect.objectContaining({ credentials: 'include' })
      );
      expect(result).toMatchObject(minimalInvitationListResponse);
    });
  });

  describe('fetchMyInvitations', () => {
    it('calls GET /invitations/mine and returns MyInvitationsResponse', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(minimalMyInvitationsResponse),
      });

      const result = await fetchMyInvitations();

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/invitations/mine`,
        expect.objectContaining({ credentials: 'include' })
      );
      expect(result).toMatchObject(minimalMyInvitationsResponse);
    });
  });

  describe('acceptInvitation', () => {
    it('calls POST /invitations/:token/accept and returns void', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(undefined),
      });

      const result = await acceptInvitation(INV_TOKEN);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/invitations/${INV_TOKEN}/accept`,
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
      expect(result).toBeUndefined();
    });
  });

  describe('declineInvitation', () => {
    it('calls POST /invitations/:token/decline and returns void', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(undefined),
      });

      const result = await declineInvitation(INV_TOKEN);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/invitations/${INV_TOKEN}/decline`,
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
      expect(result).toBeUndefined();
    });
  });
});
