import { fetchJson } from '../lib/http';
import {
  subscriptionResponseSchema,
  checkoutResponseSchema,
  type SubscriptionResponse,
  type CheckoutResponse,
  type SubscriptionPlan,
} from '@bon/types/subscriptions';

export async function fetchSubscription(businessId: string): Promise<SubscriptionResponse> {
  const json = await fetchJson<unknown>(`/businesses/${businessId}/subscription`);
  return subscriptionResponseSchema.parse(json);
}

export async function startTrial(businessId: string): Promise<SubscriptionResponse> {
  const json = await fetchJson<unknown>(`/businesses/${businessId}/subscription/trial`, {
    method: 'POST',
  });
  return subscriptionResponseSchema.parse(json);
}

export async function createCheckout(
  businessId: string,
  plan: SubscriptionPlan,
  successUrl: string,
  cancelUrl: string
): Promise<CheckoutResponse> {
  const json = await fetchJson<unknown>(`/businesses/${businessId}/subscription/checkout`, {
    method: 'POST',
    body: JSON.stringify({ plan, successUrl, cancelUrl }),
  });
  return checkoutResponseSchema.parse(json);
}

export async function cancelSubscription(businessId: string): Promise<{ ok: true }> {
  return fetchJson<{ ok: true }>(`/businesses/${businessId}/subscription/cancel`, {
    method: 'POST',
  });
}
