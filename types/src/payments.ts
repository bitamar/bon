import { z } from 'zod';
import { dateString, isoDateTime, nullableString, uuidSchema } from './common.js';

// ── Enums ──

export const PAYMENT_METHODS = ['cash', 'transfer', 'credit', 'check', 'other'] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'מזומן',
  transfer: 'העברה בנקאית',
  credit: 'אשראי',
  check: 'שיק',
  other: 'אחר',
};

// ── Request schemas ──

export const recordPaymentBodySchema = z
  .object({
    amountMinorUnits: z.number().int().positive(),
    paidAt: dateString,
    method: paymentMethodSchema,
    reference: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

export type RecordPaymentBody = z.infer<typeof recordPaymentBodySchema>;

// ── Response schemas ──

export const paymentSchema = z.object({
  id: uuidSchema,
  invoiceId: uuidSchema,
  amountMinorUnits: z.number().int(),
  paidAt: dateString,
  method: paymentMethodSchema,
  reference: nullableString,
  notes: nullableString,
  recordedByUserId: uuidSchema,
  createdAt: isoDateTime,
});

export type Payment = z.infer<typeof paymentSchema>;

export const paymentListResponseSchema = z.array(paymentSchema);

// ── Param schemas ──

export const paymentIdParamSchema = z.object({
  businessId: uuidSchema,
  invoiceId: uuidSchema,
  paymentId: uuidSchema,
});

export type PaymentIdParam = z.infer<typeof paymentIdParamSchema>;
