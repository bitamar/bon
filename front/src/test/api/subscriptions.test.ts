import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchSubscription,
  startTrial,
  createCheckout,
  cancelSubscription,
} from '../../api/subscriptions';
import { HttpError } from '../../lib/http';

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

const BIZ_ID = '00000000-0000-4000-8000-000000000001';
const SUB_ID = '00000000-0000-4000-8000-000000000002';

const minimalSubscription = {
  id: SUB_ID,
  businessId: BIZ_ID,
  plan: 'monthly',
  status: 'active',
  meshulamCustomerId: null,
  currentPeriodStart: '2026-01-01T00:00:00.000Z',
  currentPeriodEnd: '2026-02-01T00:00:00.000Z',
  trialEndsAt: null,
  cancelledAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const minimalSubscriptionResponse = {
  subscription: minimalSubscription,
  canCreateInvoices: true,
  daysRemaining: null,
};

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

describe('subscriptions api', () => {
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

  describe('fetchSubscription', () => {
    it('calls GET and returns SubscriptionResponse', async () => {
      mockOk(minimalSubscriptionResponse);

      const result = await fetchSubscription(BIZ_ID);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/subscription`,
        expect.objectContaining({ credentials: 'include' })
      );
      expect(result).toMatchObject(minimalSubscriptionResponse);
    });

    it('throws HttpError when not found', async () => {
      mockFail(404);
      await expect(fetchSubscription(BIZ_ID)).rejects.toBeInstanceOf(HttpError);
    });
  });

  describe('startTrial', () => {
    it('calls POST and returns SubscriptionResponse', async () => {
      mockOk(minimalSubscriptionResponse, 201);

      const result = await startTrial(BIZ_ID);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/subscription/trial`,
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
      expect(result).toMatchObject(minimalSubscriptionResponse);
    });

    it('throws HttpError on failure', async () => {
      mockFail(422);
      await expect(startTrial(BIZ_ID)).rejects.toBeInstanceOf(HttpError);
    });
  });

  describe('createCheckout', () => {
    it('calls POST with correct body and returns CheckoutResponse', async () => {
      const checkoutResponse = {
        paymentUrl: 'https://pay.example.com/session/abc123',
        processId: 'proc_abc123',
      };
      mockOk(checkoutResponse);

      const result = await createCheckout(
        BIZ_ID,
        'monthly',
        'https://app.example.com/success',
        'https://app.example.com/cancel'
      );

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/subscription/checkout`,
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
      expect(result).toEqual(checkoutResponse);
    });

    it('throws HttpError on failure', async () => {
      mockFail(422);
      await expect(
        createCheckout(
          BIZ_ID,
          'yearly',
          'https://app.example.com/success',
          'https://app.example.com/cancel'
        )
      ).rejects.toBeInstanceOf(HttpError);
    });
  });

  describe('cancelSubscription', () => {
    it('calls POST to cancel endpoint and returns ok', async () => {
      mockOk({ ok: true });

      const result = await cancelSubscription(BIZ_ID);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/subscription/cancel`,
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
      expect(result).toEqual({ ok: true });
    });

    it('throws HttpError on failure', async () => {
      mockFail(500);
      await expect(cancelSubscription(BIZ_ID)).rejects.toBeInstanceOf(HttpError);
    });
  });
});
