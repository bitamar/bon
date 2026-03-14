import {
  findSubscriptionByBusinessId,
  upsertSubscription,
  updateSubscription,
} from '../repositories/subscription-repository.js';
import type { SubscriptionRecord } from '../repositories/subscription-repository.js';
import { AppError, forbidden } from '../lib/app-error.js';
import { env } from '../env.js';
import { MeshulamMockClient } from './meshulam/mock-client.js';
import { MeshulamHttpClient } from './meshulam/http-client.js';
import type { MeshulamService } from './meshulam/types.js';
import { PLAN_PRICES, TRIAL_DAYS, subscriptionPlanSchema } from '@bon/types/subscriptions';
import type { SubscriptionPlan, SubscriptionStatus } from '@bon/types/subscriptions';

// ── Meshulam client singleton ──

function createMeshulamClient(): MeshulamService {
  if (env.MESHULAM_MODE === 'mock') return new MeshulamMockClient();
  const baseUrl =
    env.MESHULAM_MODE === 'production'
      ? 'https://grow.meshulam.co.il'
      : 'https://sandbox.meshulam.co.il';
  return new MeshulamHttpClient(baseUrl);
}

const meshulamClient = createMeshulamClient();

// ── Subscription status helpers ──

function serializeSubscription(record: SubscriptionRecord) {
  return {
    id: record.id,
    businessId: record.businessId,
    plan: record.plan,
    status: record.status,
    meshulamCustomerId: record.meshulamCustomerId,
    currentPeriodStart: record.currentPeriodStart.toISOString(),
    currentPeriodEnd: record.currentPeriodEnd.toISOString(),
    trialEndsAt: record.trialEndsAt?.toISOString() ?? null,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function isSubscriptionActive(sub: SubscriptionRecord): boolean {
  const now = new Date();

  if (sub.status === 'active') {
    return sub.currentPeriodEnd > now;
  }

  if (sub.status === 'trialing') {
    return sub.trialEndsAt ? sub.trialEndsAt > now : sub.currentPeriodEnd > now;
  }

  return false;
}

function daysRemaining(sub: SubscriptionRecord): number | null {
  if (!isSubscriptionActive(sub)) return 0;

  const endDate =
    sub.status === 'trialing' && sub.trialEndsAt ? sub.trialEndsAt : sub.currentPeriodEnd;

  const msRemaining = endDate.getTime() - Date.now();
  return Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
}

// ── Public API ──

export async function getSubscriptionStatus(businessId: string) {
  const sub = await findSubscriptionByBusinessId(businessId);

  if (!sub) {
    return {
      subscription: null,
      canCreateInvoices: false,
      daysRemaining: null,
    };
  }

  return {
    subscription: serializeSubscription(sub),
    canCreateInvoices: isSubscriptionActive(sub),
    daysRemaining: daysRemaining(sub),
  };
}

export async function assertCanCreateInvoice(businessId: string): Promise<void> {
  const sub = await findSubscriptionByBusinessId(businessId);

  if (!sub || !isSubscriptionActive(sub)) {
    throw forbidden({
      code: 'subscription_required',
      message: 'נדרש מנוי פעיל כדי ליצור חשבוניות. אנא הירשמו או חדשו את המנוי.',
    });
  }
}

export async function startTrial(businessId: string, plan: SubscriptionPlan = 'monthly') {
  const now = new Date();
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

  const sub = await upsertSubscription({
    businessId,
    plan,
    status: 'trialing',
    currentPeriodStart: now,
    currentPeriodEnd: trialEnd,
    trialEndsAt: trialEnd,
  });

  if (!sub) {
    throw new AppError({
      statusCode: 500,
      code: 'subscription_create_failed',
      message: 'Failed to create trial subscription',
    });
  }

  return { subscription: serializeSubscription(sub) };
}

export async function createCheckoutSession(
  businessId: string,
  plan: SubscriptionPlan,
  successUrl: string,
  cancelUrl: string
) {
  const priceMinorUnits = PLAN_PRICES[plan];
  const priceIls = priceMinorUnits / 100;

  const description = plan === 'yearly' ? 'BON — מנוי שנתי' : 'BON — מנוי חודשי';

  const pageCode = env.MESHULAM_PAGE_CODE ?? 'mock-page-code';
  const userId = env.MESHULAM_USER_ID ?? 'mock-user-id';

  const result = await meshulamClient.createPaymentProcess({
    pageCode,
    userId,
    sum: priceIls,
    description,
    successUrl,
    cancelUrl,
    customFields: {
      businessId,
      plan,
    },
  });

  // Store the process ID so we can match the webhook later
  await upsertSubscription({
    businessId,
    plan,
    status: 'past_due',
    meshulamProcessId: result.processId,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(), // will be set properly when payment confirmed
  });

  return {
    paymentUrl: result.url,
    processId: result.processId,
  };
}

export async function handlePaymentWebhook(
  transactionId: string,
  statusCode: string,
  sum: string,
  customFields: Record<string, string> | undefined
) {
  const businessId = customFields?.['businessId'];
  const planParse = subscriptionPlanSchema.safeParse(customFields?.['plan']);
  const plan: SubscriptionPlan = planParse.success ? planParse.data : 'monthly';

  if (!businessId) {
    throw new AppError({
      statusCode: 400,
      code: 'missing_business_id',
      message: 'Webhook missing businessId in customFields',
    });
  }

  // statusCode "2" = paid (שולם) in Meshulam
  if (statusCode !== '2') {
    return { processed: false, reason: `Unhandled statusCode: ${statusCode}` };
  }

  // Verify payment amount matches expected plan price (ILS, not minor units)
  const expectedPriceIls = PLAN_PRICES[plan] / 100;
  const paidAmount = Number(sum);
  if (Number.isNaN(paidAmount) || paidAmount < expectedPriceIls) {
    throw new AppError({
      statusCode: 400,
      code: 'payment_amount_mismatch',
      message: `Expected payment of ${expectedPriceIls} ILS for ${plan} plan, got ${sum}`,
    });
  }

  const now = new Date();
  const periodEnd = new Date(now);
  if (plan === 'yearly') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  await upsertSubscription({
    businessId,
    plan,
    status: 'active' as SubscriptionStatus,
    meshulamCustomerId: transactionId,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    trialEndsAt: null,
  });

  return { processed: true };
}

export async function cancelSubscription(businessId: string) {
  const sub = await findSubscriptionByBusinessId(businessId);
  if (!sub) {
    throw new AppError({
      statusCode: 404,
      code: 'subscription_not_found',
      message: 'No subscription found for this business',
    });
  }

  await updateSubscription(sub.id, {
    status: 'cancelled',
    cancelledAt: new Date(),
  });

  return { ok: true as const };
}
