import type { Invoice, LineItem, DocumentType } from './invoices.js';
import type { BusinessType } from './businesses.js';

/** Business fields needed for the PDF header. */
export interface PdfBusinessData {
  name: string;
  businessType: BusinessType;
  registrationNumber: string;
  vatNumber: string | null;
  streetAddress: string | null;
  city: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
}

/** Full payload sent to the PDF service to render an invoice. */
export interface PdfRenderInput {
  business: PdfBusinessData;
  invoice: Invoice;
  items: LineItem[];
  isDraft: boolean;
}

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
