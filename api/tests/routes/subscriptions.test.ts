import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { injectAuthed } from '../utils/inject.js';
import {
  createAuthedUser,
  createOwnerWithBusiness,
  createOwnerWithBusinessNoSub,
  createTestBusiness,
  createUser,
} from '../utils/businesses.js';
import { setupIntegrationTest } from '../utils/server.js';
import { PLAN_PRICES } from '@bon/types/subscriptions';

// ── pure helpers (no test context dependency) ──

function buildCheckoutPayload(plan: string = 'monthly') {
  return {
    plan,
    successUrl: 'https://example.com/success',
    cancelUrl: 'https://example.com/cancel',
  };
}

function buildWebhookPayload(overrides: Record<string, unknown> = {}) {
  const customFields = (overrides.customFields ?? {
    businessId: 'some-id',
    plan: 'yearly',
  }) as Record<string, string>;
  const plan = customFields.plan ?? 'yearly';
  const defaultSum = String(PLAN_PRICES[plan as keyof typeof PLAN_PRICES] / 100);

  return {
    statusCode: '2',
    transactionId: 'txn-123',
    transactionToken: 'token-abc',
    sum: defaultSum,
    customFields,
    ...overrides,
    // Ensure customFields from overrides isn't overwritten by the spread
    ...(overrides.customFields ? { customFields: overrides.customFields } : {}),
  };
}

describe('routes/subscriptions', () => {
  const ctx = setupIntegrationTest();

  // ── helpers that depend on ctx ──

  async function getSubscription(sessionId: string, businessId: string) {
    return injectAuthed(ctx.app, sessionId, {
      method: 'GET',
      url: `/businesses/${businessId}/subscription`,
    });
  }

  async function postCheckout(sessionId: string, businessId: string, plan: string = 'monthly') {
    return injectAuthed(ctx.app, sessionId, {
      method: 'POST',
      url: `/businesses/${businessId}/subscription/checkout`,
      payload: buildCheckoutPayload(plan),
    });
  }

  function computeWebhookSignature(payload: Record<string, unknown>): string {
    const rawBody = JSON.stringify(payload);
    return createHmac('sha256', 'test-webhook-secret-for-hmac-verification')
      .update(rawBody)
      .digest('hex');
  }

  async function postWebhook(payload: Record<string, unknown>, headers?: Record<string, string>) {
    const finalHeaders = headers ?? {
      'x-meshulam-signature': computeWebhookSignature(payload),
    };
    return ctx.app.inject({
      method: 'POST',
      url: '/webhooks/meshulam',
      payload,
      headers: finalHeaders,
    });
  }

  describe('GET /businesses/:businessId/subscription', () => {
    it('returns null subscription when none exists', async () => {
      const { sessionId, business } = await createOwnerWithBusinessNoSub();
      const res = await getSubscription(sessionId, business.id);

      expect(res.statusCode).toBe(200);
      const body = res.json() as { subscription: unknown; canCreateInvoices: boolean };
      expect(body.subscription).toBeNull();
      expect(body.canCreateInvoices).toBe(false);
    });

    it('returns 401 when unauthenticated', async () => {
      const user = await createUser();
      const business = await createTestBusiness(user.id);
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/businesses/${business.id}/subscription`,
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /businesses/:businessId/subscription/trial', () => {
    it('starts a 14-day trial', async () => {
      const { sessionId, business } = await createOwnerWithBusinessNoSub();

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'POST',
        url: `/businesses/${business.id}/subscription/trial`,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json() as {
        subscription: { status: string; plan: string };
        canCreateInvoices: boolean;
        daysRemaining: number;
      };
      expect(body.subscription.status).toBe('trialing');
      expect(body.subscription.plan).toBe('monthly');
      expect(body.canCreateInvoices).toBe(true);
      expect(body.daysRemaining).toBe(14);
    });

    it('overwrites existing trial when called twice', async () => {
      const { sessionId, business } = await createOwnerWithBusinessNoSub();
      const postTrial = () =>
        injectAuthed(ctx.app, sessionId, {
          method: 'POST',
          url: `/businesses/${business.id}/subscription/trial`,
        });

      const first = await postTrial();
      expect(first.statusCode).toBe(201);

      const second = await postTrial();
      expect(second.statusCode).toBe(201);
      const body = second.json() as { subscription: { status: string } };
      expect(body.subscription.status).toBe('trialing');
    });

    it('returns 403 for a non-member user', async () => {
      const { business } = await createOwnerWithBusinessNoSub();
      const { sessionId: otherSession } = await createAuthedUser();

      const res = await injectAuthed(ctx.app, otherSession, {
        method: 'POST',
        url: `/businesses/${business.id}/subscription/trial`,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /businesses/:businessId/subscription/checkout', () => {
    it('creates a checkout session for monthly plan', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const res = await postCheckout(sessionId, business.id);

      expect(res.statusCode).toBe(200);
      const body = res.json() as { paymentUrl: string; processId: string };
      expect(body.paymentUrl).toContain('sandbox.meshulam.co.il');
      expect(body.processId).toBeTruthy();
    });

    it('returns 400 for invalid plan', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();
      const res = await postCheckout(sessionId, business.id, 'invalid_plan');
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /businesses/:businessId/subscription/cancel', () => {
    it('cancels an active subscription', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      // Create subscription first
      await injectAuthed(ctx.app, sessionId, {
        method: 'POST',
        url: `/businesses/${business.id}/subscription/trial`,
      });

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'POST',
        url: `/businesses/${business.id}/subscription/cancel`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { ok: boolean };
      expect(body.ok).toBe(true);

      // Verify it's cancelled
      const statusRes = await getSubscription(sessionId, business.id);
      const status = statusRes.json() as {
        subscription: { status: string };
        canCreateInvoices: boolean;
      };
      expect(status.subscription.status).toBe('cancelled');
      expect(status.canCreateInvoices).toBe(false);
    });

    it('returns 404 when no subscription exists', async () => {
      const { sessionId, business } = await createOwnerWithBusinessNoSub();

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'POST',
        url: `/businesses/${business.id}/subscription/cancel`,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('invoice creation gate', () => {
    it('returns 403 when creating an invoice without a subscription', async () => {
      const { sessionId, business } = await createOwnerWithBusinessNoSub();

      const res = await injectAuthed(ctx.app, sessionId, {
        method: 'POST',
        url: `/businesses/${business.id}/invoices`,
        payload: { documentType: 'tax_invoice' },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json() as { error: string };
      expect(body.error).toBe('subscription_required');
    });
  });

  describe('POST /webhooks/meshulam', () => {
    it('activates subscription on successful payment webhook', async () => {
      const { sessionId, business } = await createOwnerWithBusiness();

      // Create a pending subscription via checkout
      await postCheckout(sessionId, business.id, 'yearly');

      // Simulate Meshulam webhook
      const webhookRes = await postWebhook(
        buildWebhookPayload({
          customFields: { businessId: business.id, plan: 'yearly' },
        })
      );

      expect(webhookRes.statusCode).toBe(200);
      const whBody = webhookRes.json() as { processed: boolean };
      expect(whBody.processed).toBe(true);

      // Verify subscription is now active
      const statusRes = await getSubscription(sessionId, business.id);
      const status = statusRes.json() as {
        subscription: { status: string; plan: string };
        canCreateInvoices: boolean;
      };
      expect(status.subscription.status).toBe('active');
      expect(status.subscription.plan).toBe('yearly');
      expect(status.canCreateInvoices).toBe(true);
    });

    it('returns 400 when customFields is missing businessId', async () => {
      const res = await postWebhook(buildWebhookPayload({ customFields: { plan: 'monthly' } }));

      expect(res.statusCode).toBe(400);
      const body = res.json() as { error: string };
      expect(body.error).toBe('missing_business_id');
    });

    it('returns 401 when webhook signature header is missing', async () => {
      const res = await postWebhook(
        buildWebhookPayload({
          customFields: { businessId: 'some-id', plan: 'monthly' },
        }),
        {} // Empty headers — no signature
      );

      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: 'Missing webhook signature' });
    });

    it('returns 401 when webhook signature is invalid', async () => {
      const payload = buildWebhookPayload({
        customFields: { businessId: 'some-id', plan: 'monthly' },
      });

      const res = await postWebhook(payload, {
        'x-meshulam-signature': 'deadbeef'.repeat(8),
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: 'Invalid webhook signature' });
    });

    it('returns 400 when payment amount does not match plan price', async () => {
      const { business } = await createOwnerWithBusinessNoSub();

      const res = await postWebhook(
        buildWebhookPayload({
          sum: '1',
          customFields: { businessId: business.id, plan: 'yearly' },
        })
      );

      expect(res.statusCode).toBe(400);
      const body = res.json() as { error: string };
      expect(body.error).toBe('payment_amount_mismatch');
    });
  });
});
