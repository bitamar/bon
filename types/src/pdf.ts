import { z } from 'zod';
import { invoiceSchema, lineItemSchema } from './invoices.js';
import type { DocumentType } from './invoices.js';
import { businessTypeSchema } from './businesses.js';
import type { BusinessType } from './businesses.js';

/** Zod schema for business fields needed in the PDF header. */
export const pdfBusinessDataSchema = z.object({
  name: z.string(),
  businessType: businessTypeSchema,
  registrationNumber: z.string(),
  vatNumber: z.string().nullable(),
  streetAddress: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  logoUrl: z.string().nullable(),
});

/** Business fields needed for the PDF header. */
export type PdfBusinessData = z.infer<typeof pdfBusinessDataSchema>;

/** Zod schema for the full payload sent to the PDF service. */
export const pdfRenderInputSchema = z.object({
  business: pdfBusinessDataSchema,
  invoice: invoiceSchema,
  items: z.array(lineItemSchema),
  isDraft: z.boolean(),
});

/** Full payload sent to the PDF service to render an invoice. */
export type PdfRenderInput = z.infer<typeof pdfRenderInputSchema>;

/** Hebrew labels for document types on the printed invoice. */
export const DOCUMENT_TYPE_PDF_LABELS: Record<DocumentType, string> = {
  tax_invoice: '\u05D7\u05E9\u05D1\u05D5\u05E0\u05D9\u05EA \u05DE\u05E1',
  tax_invoice_receipt:
    '\u05D7\u05E9\u05D1\u05D5\u05E0\u05D9\u05EA \u05DE\u05E1 \u05E7\u05D1\u05DC\u05D4',
  receipt: '\u05E7\u05D1\u05DC\u05D4',
  credit_note:
    '\u05D7\u05E9\u05D1\u05D5\u05E0\u05D9\u05EA \u05DE\u05E1 \u05D6\u05D9\u05DB\u05D5\u05D9',
};

/** Hebrew labels for business types. */
export const BUSINESS_TYPE_PDF_LABELS: Record<BusinessType, string> = {
  licensed_dealer: '\u05E2\u05D5\u05E1\u05E7 \u05DE\u05D5\u05E8\u05E9\u05D4',
  exempt_dealer: '\u05E2\u05D5\u05E1\u05E7 \u05E4\u05D8\u05D5\u05E8',
  limited_company: '\u05D7\u05D1\u05E8\u05D4 \u05D1\u05E2"\u05DE',
};
