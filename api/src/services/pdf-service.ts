import { findInvoiceById, findItemsByInvoiceId } from '../repositories/invoice-repository.js';
import { findBusinessById } from '../repositories/business-repository.js';
import { notFound, unprocessableEntity } from '../lib/app-error.js';
import { localStorageService, type StorageService } from '../lib/storage-service.js';
import { env } from '../env.js';
import { toNumber } from '../lib/numeric.js';
import type { PdfRenderInput, PdfBusinessData } from '@bon/types/pdf';
import type { Invoice, LineItem } from '@bon/types/invoices';
import type { InvoiceRecord, InvoiceItemRecord } from '../repositories/invoice-repository.js';

const storage: StorageService = localStorageService;

function cacheKey(invoiceId: string): string {
  return `${invoiceId}.pdf`;
}

function serializeInvoiceForPdf(record: InvoiceRecord): Invoice {
  const coerceDate = (v: unknown): string =>
    typeof v === 'string' ? v : (v as Date).toISOString().split('T')[0]!;

  return {
    id: record.id,
    businessId: record.businessId,
    customerId: record.customerId ?? null,
    customerName: record.customerName ?? null,
    customerTaxId: record.customerTaxId ?? null,
    customerAddress: record.customerAddress ?? null,
    customerEmail: record.customerEmail ?? null,
    documentType: record.documentType,
    status: record.status,
    isOverdue: record.isOverdue,
    sequenceGroup: record.sequenceGroup ?? null,
    sequenceNumber: record.sequenceNumber ?? null,
    documentNumber: record.documentNumber ?? null,
    creditedInvoiceId: record.creditedInvoiceId ?? null,
    invoiceDate: coerceDate(record.invoiceDate),
    issuedAt: record.issuedAt ? record.issuedAt.toISOString() : null,
    dueDate: record.dueDate ? coerceDate(record.dueDate) : null,
    notes: record.notes ?? null,
    internalNotes: record.internalNotes ?? null,
    currency: record.currency,
    vatExemptionReason: record.vatExemptionReason ?? null,
    subtotalMinorUnits: record.subtotalMinorUnits,
    discountMinorUnits: record.discountMinorUnits,
    totalExclVatMinorUnits: record.totalExclVatMinorUnits,
    vatMinorUnits: record.vatMinorUnits,
    totalInclVatMinorUnits: record.totalInclVatMinorUnits,
    allocationStatus: record.allocationStatus ?? null,
    allocationNumber: record.allocationNumber ?? null,
    allocationError: record.allocationError ?? null,
    sentAt: record.sentAt ? record.sentAt.toISOString() : null,
    paidAt: record.paidAt ? record.paidAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeItemForPdf(record: InvoiceItemRecord): LineItem {
  return {
    id: record.id,
    invoiceId: record.invoiceId,
    position: record.position,
    description: record.description,
    catalogNumber: record.catalogNumber ?? null,
    quantity: toNumber(record.quantity),
    unitPriceMinorUnits: record.unitPriceMinorUnits,
    discountPercent: toNumber(record.discountPercent),
    vatRateBasisPoints: record.vatRateBasisPoints,
    lineTotalMinorUnits: record.lineTotalMinorUnits,
    vatAmountMinorUnits: record.vatAmountMinorUnits,
    lineTotalInclVatMinorUnits: record.lineTotalInclVatMinorUnits,
  };
}

async function callPdfService(input: PdfRenderInput): Promise<Buffer> {
  const pdfServiceUrl = env.PDF_SERVICE_URL;
  if (!pdfServiceUrl) {
    throw new Error('PDF_SERVICE_URL is not configured');
  }

  const res = await fetch(`${pdfServiceUrl}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PDF service error (${res.status}): ${body}`);
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
    const cached = await storage.get(cacheKey(invoiceId));
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
    invoice: serializeInvoiceForPdf(invoice),
    items: itemRecords.map(serializeItemForPdf),
    isDraft,
  };

  const pdfBuffer = await callPdfService(renderInput);

  // Cache finalized PDFs
  if (!isDraft) {
    await storage.put(cacheKey(invoiceId), pdfBuffer);
  }

  return {
    pdf: pdfBuffer,
    filename: `${invoice.documentNumber ?? invoiceId}.pdf`,
  };
}

export async function invalidatePdfCache(invoiceId: string): Promise<void> {
  await storage.del(cacheKey(invoiceId));
}
