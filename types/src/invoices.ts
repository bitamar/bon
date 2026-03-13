import { z } from 'zod';
import {
  dateString,
  isoDateTime,
  nonEmptyString,
  nullableDateString,
  nullableInt,
  nullableIsoDateTime,
  nullableString,
  nullableUuid,
  uuidSchema,
} from './common.js';
import { paymentSchema } from './payments.js';

// ── Enums ──

export const DOCUMENT_TYPES = [
  'tax_invoice',
  'tax_invoice_receipt',
  'receipt',
  'credit_note',
] as const;

export const SEQUENCE_GROUPS = ['tax_document', 'credit_note', 'receipt'] as const;

export const INVOICE_STATUSES = [
  'draft',
  'finalized',
  'sent',
  'paid',
  'partially_paid',
  'cancelled',
  'credited',
] as const;

export const ALLOCATION_STATUSES = ['pending', 'approved', 'rejected', 'emergency'] as const;

export const documentTypeSchema = z.enum(DOCUMENT_TYPES);

export const sequenceGroupSchema = z.enum(SEQUENCE_GROUPS);

export const invoiceStatusSchema = z.enum(INVOICE_STATUSES);

export const allocationStatusSchema = z.enum(ALLOCATION_STATUSES);

// ── Request schemas ──

export const lineItemInputSchema = z.object({
  description: nonEmptyString,
  catalogNumber: z.string().trim().optional(),
  quantity: z.number().positive(),
  unitPriceMinorUnits: z.number().int().nonnegative(),
  discountPercent: z.number().min(0).max(100).default(0),
  vatRateBasisPoints: z.number().int().nonnegative(),
  position: z.number().int().nonnegative(),
});

export const createInvoiceDraftBodySchema = z
  .object({
    documentType: documentTypeSchema,
    customerId: uuidSchema.optional(),
    invoiceDate: dateString.optional(),
    dueDate: dateString.optional(),
    notes: z.string().trim().optional(),
    internalNotes: z.string().trim().optional(),
    items: z.array(lineItemInputSchema).optional(),
  })
  .strict();

export const updateInvoiceDraftBodySchema = z
  .object({
    customerId: nullableUuid.optional(),
    documentType: documentTypeSchema.optional(),
    invoiceDate: dateString.optional(),
    dueDate: nullableDateString.optional(),
    notes: z.union([z.string().trim(), z.literal(null)]).optional(),
    internalNotes: z.union([z.string().trim(), z.literal(null)]).optional(),
    items: z.array(lineItemInputSchema).optional(),
  })
  .strict();

export const finalizeInvoiceBodySchema = z
  .object({
    invoiceDate: dateString.optional(),
    vatExemptionReason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const sendInvoiceBodySchema = z
  .object({
    recipientEmail: z.string().email().optional(),
  })
  .strict();

export const sendInvoiceResponseSchema = z.object({
  ok: z.literal(true),
  sentAt: isoDateTime,
});

// ── Response schemas ──

// Note: quantity and discountPercent are numeric DB columns returned as strings
// by the driver. The service layer converts them to numbers with Number() before
// building the API response.
export const lineItemSchema = z.object({
  id: uuidSchema,
  invoiceId: uuidSchema,
  position: z.number().int().nonnegative(),
  description: nonEmptyString,
  catalogNumber: nullableString,
  quantity: z.number(),
  unitPriceMinorUnits: z.number().int(),
  discountPercent: z.number(),
  vatRateBasisPoints: z.number().int(),
  lineTotalMinorUnits: z.number().int(),
  vatAmountMinorUnits: z.number().int(),
  lineTotalInclVatMinorUnits: z.number().int(),
});

export const invoiceSchema = z.object({
  id: uuidSchema,
  businessId: uuidSchema,
  customerId: nullableUuid,

  // Customer snapshot at finalization
  customerName: nullableString,
  customerTaxId: nullableString,
  customerAddress: nullableString,
  customerEmail: nullableString,

  documentType: documentTypeSchema,
  status: invoiceStatusSchema,
  isOverdue: z.boolean(),
  sequenceGroup: z.union([sequenceGroupSchema, z.literal(null)]),
  sequenceNumber: nullableInt,
  documentNumber: nullableString,
  creditedInvoiceId: nullableUuid,
  invoiceDate: dateString,
  issuedAt: nullableIsoDateTime,
  dueDate: nullableDateString,
  notes: nullableString,
  internalNotes: nullableString,
  currency: z.string(),
  vatExemptionReason: nullableString,
  subtotalMinorUnits: z.number().int(),
  discountMinorUnits: z.number().int(),
  totalExclVatMinorUnits: z.number().int(),
  vatMinorUnits: z.number().int(),
  totalInclVatMinorUnits: z.number().int(),
  allocationStatus: z.union([allocationStatusSchema, z.literal(null)]),
  allocationNumber: nullableString,
  allocationError: nullableString,
  sentAt: nullableIsoDateTime,
  paidAt: nullableIsoDateTime,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const invoiceResponseSchema = z.object({
  invoice: invoiceSchema,
  items: z.array(lineItemSchema),
  payments: z.array(paymentSchema),
  remainingBalanceMinorUnits: z.number().int().nonnegative(),
});

export const invoiceListItemSchema = z.object({
  id: uuidSchema,
  businessId: uuidSchema,
  customerId: nullableUuid,
  customerName: nullableString,
  documentType: documentTypeSchema,
  status: invoiceStatusSchema,
  isOverdue: z.boolean(),
  sequenceGroup: z.union([sequenceGroupSchema, z.literal(null)]),
  documentNumber: nullableString,
  invoiceDate: dateString,
  dueDate: nullableDateString,
  totalInclVatMinorUnits: z.number().int(),
  currency: z.string(),
  createdAt: isoDateTime,
});

// ── Param schemas ──

export const invoiceIdParamSchema = z.object({
  businessId: uuidSchema,
  invoiceId: uuidSchema,
});

// ── Query / list response schemas ──

export const invoiceListQuerySchema = z
  .object({
    status: z
      .string()
      .trim()
      .transform((s) => s.split(',').map((v) => v.trim()).filter(Boolean))
      .pipe(z.array(invoiceStatusSchema).min(1))
      .optional(),
    customerId: uuidSchema.optional(),
    documentType: documentTypeSchema.optional(),
    dateFrom: z.string().trim().date().optional(),
    dateTo: z.string().trim().date().optional(),
    q: z.string().trim().max(100).optional(),
    sort: z
      .enum([
        'invoiceDate:asc',
        'invoiceDate:desc',
        'dueDate:asc',
        'dueDate:desc',
        'totalInclVatMinorUnits:asc',
        'totalInclVatMinorUnits:desc',
        'createdAt:desc',
      ])
      .optional()
      .default('invoiceDate:desc'),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(200).optional().default(20),
  })
  .refine((data) => !data.dateFrom || !data.dateTo || data.dateFrom <= data.dateTo, {
    message: 'תאריך סיום חייב להיות אחרי תאריך התחלה',
    path: ['dateTo'],
  });

export const invoiceListAggregatesSchema = z.object({
  totalOutstandingMinorUnits: z.number().int(),
  countOutstanding: z.number().int().nonnegative(),
  totalFilteredMinorUnits: z.number().int(),
});

export const invoiceListResponseSchema = z.object({
  invoices: z.array(invoiceListItemSchema),
  total: z.number().int().nonnegative(),
  aggregates: invoiceListAggregatesSchema,
});

// ── Type exports ──

export type DocumentType = z.infer<typeof documentTypeSchema>;

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  tax_invoice: 'חשבונית מס',
  tax_invoice_receipt: 'חשבונית מס קבלה',
  receipt: 'קבלה',
  credit_note: 'חשבונית מס זיכוי',
};

export type SequenceGroup = z.infer<typeof sequenceGroupSchema>;
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type AllocationStatus = z.infer<typeof allocationStatusSchema>;
export type LineItemInput = z.infer<typeof lineItemInputSchema>;
export type CreateInvoiceDraftBody = z.infer<typeof createInvoiceDraftBodySchema>;
export type UpdateInvoiceDraftBody = z.infer<typeof updateInvoiceDraftBodySchema>;
export type FinalizeInvoiceBody = z.infer<typeof finalizeInvoiceBodySchema>;
export type LineItem = z.infer<typeof lineItemSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type InvoiceResponse = z.infer<typeof invoiceResponseSchema>;
export type InvoiceListItem = z.infer<typeof invoiceListItemSchema>;
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;
export type InvoiceListAggregates = z.infer<typeof invoiceListAggregatesSchema>;
export type InvoiceListResponse = z.infer<typeof invoiceListResponseSchema>;
export type InvoiceIdParam = z.infer<typeof invoiceIdParamSchema>;
export type SendInvoiceBody = z.infer<typeof sendInvoiceBodySchema>;
export type SendInvoiceResponse = z.infer<typeof sendInvoiceResponseSchema>;
