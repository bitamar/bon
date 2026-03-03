import { findInvoiceById, findItemsByInvoiceId } from '../repositories/invoice-repository.js';
import { findBusinessById } from '../repositories/business-repository.js';
import { AppError, notFound, unprocessableEntity } from '../lib/app-error.js';
import { localStorageService, type StorageService } from '../lib/storage-service.js';
import { serializeInvoice, serializeInvoiceItem } from '../lib/invoice-serializers.js';
import { env } from '../env.js';
import type { PdfRenderInput, PdfBusinessData } from '@bon/types/pdf';

const storage: StorageService = localStorageService;

function cacheKey(businessId: string, invoiceId: string): string {
  return `${businessId}:${invoiceId}.pdf`;
}

const PDF_FETCH_TIMEOUT_MS = 30_000;

async function callPdfService(input: PdfRenderInput): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PDF_FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${env.PDF_SERVICE_URL}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AppError({
        statusCode: 504,
        code: 'pdf_service_timeout',
        message: 'PDF service request timed out',
        cause: err,
      });
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new AppError({
      statusCode: 502,
      code: 'pdf_service_error',
      message: `PDF service error (${res.status}): ${body}`,
    });
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function generateInvoicePdf(
  businessId: string,
  invoiceId: string
): Promise<{ pdf: Buffer; filename: string }> {
  const invoice = await findInvoiceById(invoiceId, businessId);
  if (!invoice) throw notFound();

  const isDraft = invoice.status === 'draft';

  // Only cache finalized (non-draft) invoices
  if (!isDraft) {
    const cached = await storage.get(cacheKey(businessId, invoiceId));
    if (cached) {
      return {
        pdf: cached,
        filename: `${invoice.documentNumber ?? invoiceId}.pdf`,
      };
    }
  }

  const business = await findBusinessById(businessId);
  if (!business) throw notFound();

  const itemRecords = await findItemsByInvoiceId(invoiceId);

  if (itemRecords.length === 0 && !isDraft) {
    throw unprocessableEntity({ code: 'no_line_items' });
  }

  const businessData: PdfBusinessData = {
    name: business.name,
    businessType: business.businessType,
    registrationNumber: business.registrationNumber,
    vatNumber: business.vatNumber ?? null,
    streetAddress: business.streetAddress ?? null,
    city: business.city ?? null,
    postalCode: business.postalCode ?? null,
    phone: business.phone ?? null,
    email: business.email ?? null,
    logoUrl: business.logoUrl ?? null,
  };

  const renderInput: PdfRenderInput = {
    business: businessData,
    invoice: serializeInvoice(invoice),
    items: itemRecords.map(serializeInvoiceItem),
    isDraft,
  };

  const pdfBuffer = await callPdfService(renderInput);

  // Cache finalized PDFs (best-effort — don't fail the response on cache errors)
  if (!isDraft) {
    try {
      await storage.put(cacheKey(businessId, invoiceId), pdfBuffer);
    } catch {
      // Cache write failure is non-critical; the PDF was generated successfully
    }
  }

  return {
    pdf: pdfBuffer,
    filename: `${invoice.documentNumber ?? invoiceId}.pdf`,
  };
}
