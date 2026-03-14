import { z } from 'zod';
import { isoDateTime, nullableIsoDateTime, nullableString, uuidSchema } from './common.js';

// ── Enums ──

export const SUBSCRIPTION_PLANS = ['monthly', 'yearly'] as const;
export const subscriptionPlanSchema = z.enum(SUBSCRIPTION_PLANS);
export type SubscriptionPlan = z.infer<typeof subscriptionPlanSchema>;

export const SUBSCRIPTION_STATUSES = ['active', 'past_due', 'cancelled', 'trialing'] as const;
export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  monthly: 'חודשי',
  yearly: 'שנתי',
};

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'פעיל',
  past_due: 'ממתין לתשלום',
  cancelled: 'בוטל',
  trialing: 'תקופת ניסיון',
};

// ── Pricing (minor units, ILS) ──

export const PLAN_PRICES: Record<SubscriptionPlan, number> = {
  monthly: 9900, // ₪99.00
  yearly: 99900, // ₪999.00 (saves ~₪189/year)
};

export const TRIAL_DAYS = 14;

// ── Response schemas ──

export const subscriptionSchema = z.object({
  id: uuidSchema,
  businessId: uuidSchema,
  plan: subscriptionPlanSchema,
  status: subscriptionStatusSchema,
  meshulamCustomerId: nullableString,
  currentPeriodStart: isoDateTime,
  currentPeriodEnd: isoDateTime,
  trialEndsAt: nullableIsoDateTime,
  cancelledAt: nullableIsoDateTime,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export type Subscription = z.infer<typeof subscriptionSchema>;

export const subscriptionResponseSchema = z.object({
  subscription: subscriptionSchema.nullable(),
  canCreateInvoices: z.boolean(),
  daysRemaining: z.number().int().nullable(),
});

export type SubscriptionResponse = z.infer<typeof subscriptionResponseSchema>;

// ── Request schemas ──

export const createCheckoutBodySchema = z
  .object({
    plan: subscriptionPlanSchema,
    successUrl: z.string().url(),
    cancelUrl: z.string().url(),
  })
  .strict();

export type CreateCheckoutBody = z.infer<typeof createCheckoutBodySchema>;

export const checkoutResponseSchema = z.object({
  paymentUrl: z.string().url(),
  processId: z.string(),
});

export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

export const cancelResponseSchema = z.object({
  ok: z.literal(true),
});

// ── Webhook payload (from Meshulam) ──

export const meshulamWebhookSchema = z.object({
  statusCode: z.string(),
  transactionId: z.string(),
  transactionToken: z.string(),
  asmachta: z.string().optional(),
  cardSuffix: z.string().optional(),
  sum: z.string(),
  fullName: z.string().optional(),
  payerPhone: z.string().optional(),
  payerEmail: z.string().optional(),
  description: z.string().optional(),
  customFields: z.record(z.string(), z.string()).optional(),
});

export type MeshulamWebhook = z.infer<typeof meshulamWebhookSchema>;
