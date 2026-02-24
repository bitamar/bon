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
    invoiceDate: nullableDateString.optional(),
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
  totalInclVatMinorUnits: z.number().int(),
  createdAt: isoDateTime,
});

// ── Param schemas ──

export const invoiceIdParamSchema = z.object({
  businessId: uuidSchema,
  invoiceId: uuidSchema,
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
export type InvoiceIdParam = z.infer<typeof invoiceIdParamSchema>;
