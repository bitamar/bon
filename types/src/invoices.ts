import { z } from 'zod';
import {
  isoDateTime,
  nonEmptyString,
  nullableIsoDateTime,
  nullableString,
  uuidSchema,
} from './common.js';

// ── Enums ──

export const documentTypeSchema = z.enum([
  'tax_invoice',
  'tax_invoice_receipt',
  'receipt',
  'credit_note',
]);

export const sequenceGroupSchema = z.enum(['tax_document', 'credit_note', 'receipt']);

export const invoiceStatusSchema = z.enum([
  'draft',
  'finalized',
  'sent',
  'paid',
  'partially_paid',
  'cancelled',
  'credited',
]);

export const allocationStatusSchema = z.enum(['pending', 'approved', 'rejected', 'emergency']);

// ── Request schemas ──

export const invoiceItemInputSchema = z.object({
  description: nonEmptyString,
  catalogNumber: z.string().trim().optional(),
  quantity: z.number().positive(),
  unitPriceAgora: z.number().int().nonnegative(),
  discountPercent: z.number().min(0).max(100).default(0),
  vatRateBasisPoints: z.number().int().nonnegative(),
  position: z.number().int().nonnegative(),
});

export const createInvoiceDraftBodySchema = z
  .object({
    documentType: documentTypeSchema,
    customerId: uuidSchema.optional(),
    invoiceDate: z.string().trim().date().optional(),
    dueDate: z.string().trim().date().optional(),
    notes: z.string().trim().optional(),
    internalNotes: z.string().trim().optional(),
    items: z.array(invoiceItemInputSchema).optional(),
  })
  .strict();

export const updateInvoiceDraftBodySchema = z
  .object({
    customerId: z.union([uuidSchema, z.literal(null)]).optional(),
    documentType: documentTypeSchema.optional(),
    invoiceDate: z.union([z.string().trim().date(), z.literal(null)]).optional(),
    dueDate: z.union([z.string().trim().date(), z.literal(null)]).optional(),
    notes: z.union([z.string().trim(), z.literal(null)]).optional(),
    internalNotes: z.union([z.string().trim(), z.literal(null)]).optional(),
    items: z.array(invoiceItemInputSchema).optional(),
  })
  .strict();

export const finalizeInvoiceBodySchema = z
  .object({
    invoiceDate: z.string().trim().date().optional(),
  })
  .strict();

// ── Response schemas ──

// Note: quantity and discountPercent are numeric DB columns returned as strings
// by the driver. The service layer converts them to numbers with Number() before
// building the API response.
export const invoiceItemSchema = z.object({
  id: uuidSchema,
  invoiceId: uuidSchema,
  position: z.number().int().nonnegative(),
  description: nonEmptyString,
  catalogNumber: nullableString,
  quantity: z.number(),
  unitPriceAgora: z.number().int(),
  discountPercent: z.number(),
  vatRateBasisPoints: z.number().int(),
  lineTotalAgora: z.number().int(),
  vatAmountAgora: z.number().int(),
  lineTotalInclVatAgora: z.number().int(),
});

export const invoiceSchema = z.object({
  id: uuidSchema,
  businessId: uuidSchema,
  customerId: z.union([uuidSchema, z.literal(null)]),

  // Customer snapshot at finalization
  customerName: nullableString,
  customerTaxId: nullableString,
  customerAddress: nullableString,
  customerEmail: nullableString,

  documentType: documentTypeSchema,
  status: invoiceStatusSchema,
  isOverdue: z.boolean(),
  sequenceGroup: z.union([sequenceGroupSchema, z.literal(null)]),
  sequenceNumber: z.union([z.number().int(), z.literal(null)]),
  fullNumber: nullableString,
  creditedInvoiceId: z.union([uuidSchema, z.literal(null)]),
  invoiceDate: z.string(),
  issuedAt: nullableIsoDateTime,
  dueDate: nullableString,
  notes: nullableString,
  internalNotes: nullableString,
  currency: z.string(),
  vatExemptionReason: nullableString,
  subtotalAgora: z.number().int(),
  discountAgora: z.number().int(),
  totalExclVatAgora: z.number().int(),
  vatAgora: z.number().int(),
  totalInclVatAgora: z.number().int(),
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
  items: z.array(invoiceItemSchema),
});

export const invoiceListItemSchema = z.object({
  id: uuidSchema,
  businessId: uuidSchema,
  customerId: z.union([uuidSchema, z.literal(null)]),
  customerName: nullableString,
  documentType: documentTypeSchema,
  status: invoiceStatusSchema,
  isOverdue: z.boolean(),
  sequenceGroup: z.union([sequenceGroupSchema, z.literal(null)]),
  fullNumber: nullableString,
  invoiceDate: z.string(),
  totalInclVatAgora: z.number().int(),
  createdAt: isoDateTime,
});

// ── Param schemas ──

export const invoiceIdParamSchema = z.object({
  businessId: uuidSchema,
  invoiceId: uuidSchema,
});

// ── Type exports ──

export type DocumentType = z.infer<typeof documentTypeSchema>;
export type SequenceGroup = z.infer<typeof sequenceGroupSchema>;
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type AllocationStatus = z.infer<typeof allocationStatusSchema>;
export type InvoiceItemInput = z.infer<typeof invoiceItemInputSchema>;
export type CreateInvoiceDraftBody = z.infer<typeof createInvoiceDraftBodySchema>;
export type UpdateInvoiceDraftBody = z.infer<typeof updateInvoiceDraftBodySchema>;
export type FinalizeInvoiceBody = z.infer<typeof finalizeInvoiceBodySchema>;
export type InvoiceItem = z.infer<typeof invoiceItemSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type InvoiceResponse = z.infer<typeof invoiceResponseSchema>;
export type InvoiceListItem = z.infer<typeof invoiceListItemSchema>;
export type InvoiceIdParam = z.infer<typeof invoiceIdParamSchema>;
