import {
  insertInvoice,
  findInvoiceById,
  updateInvoice,
  deleteInvoice,
  insertItems,
  deleteItemsByInvoiceId,
  findItemsByInvoiceId,
  type InvoiceRecord,
  type InvoiceItemRecord,
} from '../repositories/invoice-repository.js';
import { findCustomerById } from '../repositories/customer-repository.js';
import { findBusinessById } from '../repositories/business-repository.js';
import { notFound, unprocessableEntity } from '../lib/app-error.js';
import { assignInvoiceNumber, documentTypeToSequenceGroup } from '../lib/invoice-sequences.js';
import { calculateLine, calculateInvoiceTotals } from '@bon/types/vat';
import { db } from '../db/client.js';
import type {
  Invoice,
  InvoiceItem,
  InvoiceResponse,
  InvoiceItemInput,
  DocumentType,
} from '@bon/types/invoices';

// ── serializers ──

function coerceToDateString(value: unknown): string {
  if (typeof value === 'string') return value;
  return (value as Date).toISOString().split('T')[0]!;
}

function serializeInvoice(record: InvoiceRecord): Invoice {
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
    fullNumber: record.fullNumber ?? null,
    creditedInvoiceId: record.creditedInvoiceId ?? null,
    invoiceDate: coerceToDateString(record.invoiceDate),
    issuedAt: record.issuedAt ? record.issuedAt.toISOString() : null,
    dueDate: record.dueDate ? coerceToDateString(record.dueDate) : null,
    notes: record.notes ?? null,
    internalNotes: record.internalNotes ?? null,
    currency: record.currency,
    vatExemptionReason: record.vatExemptionReason ?? null,
    subtotalAgora: record.subtotalAgora,
    discountAgora: record.discountAgora,
    totalExclVatAgora: record.totalExclVatAgora,
    vatAgora: record.vatAgora,
    totalInclVatAgora: record.totalInclVatAgora,
    allocationStatus: record.allocationStatus ?? null,
    allocationNumber: record.allocationNumber ?? null,
    allocationError: record.allocationError ?? null,
    sentAt: record.sentAt ? record.sentAt.toISOString() : null,
    paidAt: record.paidAt ? record.paidAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeInvoiceItem(record: InvoiceItemRecord): InvoiceItem {
  return {
    id: record.id,
    invoiceId: record.invoiceId,
    position: record.position,
    description: record.description,
    catalogNumber: record.catalogNumber ?? null,
    quantity: Number(record.quantity),
    unitPriceAgora: record.unitPriceAgora,
    discountPercent: Number(record.discountPercent),
    vatRateBasisPoints: record.vatRateBasisPoints,
    lineTotalAgora: record.lineTotalAgora,
    vatAmountAgora: record.vatAmountAgora,
    lineTotalInclVatAgora: record.lineTotalInclVatAgora,
  };
}

// ── helpers ──

function buildItemInsert(invoiceId: string, item: InvoiceItemInput) {
  const line = calculateLine({
    quantity: item.quantity,
    unitPriceAgora: item.unitPriceAgora,
    discountPercent: item.discountPercent,
    vatRateBasisPoints: item.vatRateBasisPoints,
  });
  return {
    invoiceId,
    position: item.position,
    description: item.description,
    catalogNumber: item.catalogNumber ?? null,
    quantity: String(item.quantity),
    unitPriceAgora: item.unitPriceAgora,
    discountPercent: String(item.discountPercent),
    vatRateBasisPoints: item.vatRateBasisPoints,
    lineTotalAgora: line.lineTotalAgora,
    vatAmountAgora: line.vatAmountAgora,
    lineTotalInclVatAgora: line.lineTotalInclVatAgora,
  };
}

function computeTotals(items: InvoiceItemInput[]) {
  return calculateInvoiceTotals(
    items.map((i) => ({
      quantity: i.quantity,
      unitPriceAgora: i.unitPriceAgora,
      discountPercent: i.discountPercent,
      vatRateBasisPoints: i.vatRateBasisPoints,
    }))
  );
}

function buildResponse(invoice: InvoiceRecord, itemRecords: InvoiceItemRecord[]): InvoiceResponse {
  return {
    invoice: serializeInvoice(invoice),
    items: itemRecords.map(serializeInvoiceItem),
  };
}

function todayDateString(): string {
  return new Date().toISOString().split('T')[0]!;
}

function maxFutureDateString(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0]!;
}

// ── public methods ──

export type CreateDraftInput = {
  documentType: DocumentType;
  customerId?: string | undefined;
  invoiceDate?: string | undefined;
  dueDate?: string | undefined;
  notes?: string | undefined;
  internalNotes?: string | undefined;
  items?: InvoiceItemInput[] | undefined;
};

export async function createDraft(businessId: string, input: CreateDraftInput) {
  const now = new Date();

  const invoiceData: Parameters<typeof insertInvoice>[0] = {
    businessId,
    documentType: input.documentType,
    customerId: input.customerId ?? null,
    invoiceDate: input.invoiceDate ?? todayDateString(),
    dueDate: input.dueDate ?? null,
    notes: input.notes ?? null,
    internalNotes: input.internalNotes ?? null,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };

  if (input.items && input.items.length > 0) {
    const totals = computeTotals(input.items);
    Object.assign(invoiceData, totals);
  }

  const invoice = await insertInvoice(invoiceData);
  if (!invoice) throw new Error('Failed to create invoice');

  let itemRecords: InvoiceItemRecord[] = [];
  if (input.items && input.items.length > 0) {
    itemRecords = await insertItems(input.items.map((i) => buildItemInsert(invoice.id, i)));
  }

  return buildResponse(invoice, itemRecords);
}

export async function getInvoice(businessId: string, invoiceId: string) {
  const invoice = await findInvoiceById(invoiceId, businessId);
  if (!invoice) throw notFound();

  const items = await findItemsByInvoiceId(invoiceId);
  return buildResponse(invoice, items);
}

export type UpdateDraftInput = {
  customerId?: string | null | undefined;
  documentType?: DocumentType | undefined;
  invoiceDate?: string | null | undefined;
  dueDate?: string | null | undefined;
  notes?: string | null | undefined;
  internalNotes?: string | null | undefined;
  items?: InvoiceItemInput[] | undefined;
};

export async function updateDraft(businessId: string, invoiceId: string, input: UpdateDraftInput) {
  const existing = await findInvoiceById(invoiceId, businessId);
  if (!existing) throw notFound();
  if (existing.status !== 'draft') {
    throw unprocessableEntity({ code: 'not_draft' });
  }

  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (input.customerId !== undefined) updates['customerId'] = input.customerId;
  if (input.documentType !== undefined) updates['documentType'] = input.documentType;
  if (input.invoiceDate !== undefined) updates['invoiceDate'] = input.invoiceDate;
  if (input.dueDate !== undefined) updates['dueDate'] = input.dueDate;
  if (input.notes !== undefined) updates['notes'] = input.notes;
  if (input.internalNotes !== undefined) updates['internalNotes'] = input.internalNotes;

  if (input.items !== undefined) {
    return db.transaction(async (tx) => {
      await deleteItemsByInvoiceId(invoiceId, tx);
      if (input.items!.length > 0) {
        await insertItems(
          input.items!.map((i) => buildItemInsert(invoiceId, i)),
          tx
        );
        const totals = computeTotals(input.items!);
        Object.assign(updates, totals);
      } else {
        updates['subtotalAgora'] = 0;
        updates['discountAgora'] = 0;
        updates['totalExclVatAgora'] = 0;
        updates['vatAgora'] = 0;
        updates['totalInclVatAgora'] = 0;
      }

      const updated = await updateInvoice(
        invoiceId,
        businessId,
        updates as Parameters<typeof updateInvoice>[2],
        tx
      );
      if (!updated) throw notFound();

      const items = await findItemsByInvoiceId(invoiceId, tx);
      return buildResponse(updated, items);
    });
  }

  const updated = await updateInvoice(
    invoiceId,
    businessId,
    updates as Parameters<typeof updateInvoice>[2]
  );
  if (!updated) throw notFound();

  const items = await findItemsByInvoiceId(invoiceId);
  return buildResponse(updated, items);
}

export async function deleteDraft(businessId: string, invoiceId: string) {
  const existing = await findInvoiceById(invoiceId, businessId);
  if (!existing) throw notFound();
  if (existing.status !== 'draft') {
    throw unprocessableEntity({ code: 'not_draft' });
  }

  await deleteInvoice(invoiceId, businessId);
}

export async function finalize(
  businessId: string,
  invoiceId: string,
  body: { invoiceDate?: string | undefined }
) {
  // TODO: TOCTOU — move validation inside tx with SELECT FOR UPDATE before SHAAM integration
  const invoice = await findInvoiceById(invoiceId, businessId);
  if (!invoice) throw notFound();
  if (invoice.status !== 'draft') {
    throw unprocessableEntity({ code: 'not_draft' });
  }

  // Validate customer
  if (!invoice.customerId) {
    throw unprocessableEntity({ code: 'missing_customer' });
  }
  const customer = await findCustomerById(invoice.customerId, businessId);
  if (!customer) {
    throw unprocessableEntity({ code: 'customer_not_found' });
  }
  if (!customer.isActive) {
    throw unprocessableEntity({ code: 'customer_inactive' });
  }

  // Validate line items
  const items = await findItemsByInvoiceId(invoiceId);
  if (items.length === 0) {
    throw unprocessableEntity({ code: 'no_line_items' });
  }

  // Validate invoice date (compare ISO date strings to avoid timezone issues)
  const invoiceDate = body.invoiceDate ?? coerceToDateString(invoice.invoiceDate);
  const maxDateStr = maxFutureDateString(7);
  if (invoiceDate > maxDateStr) {
    throw unprocessableEntity({ code: 'invalid_invoice_date' });
  }

  // Load business for prefix and seed number
  const business = await findBusinessById(businessId);
  if (!business) throw notFound();

  // Validate VAT rates
  const isExemptDealer = business.businessType === 'exempt_dealer';
  for (const item of items) {
    if (isExemptDealer && item.vatRateBasisPoints !== 0) {
      throw unprocessableEntity({ code: 'invalid_vat_rate' });
    }
    if (!isExemptDealer && item.vatRateBasisPoints !== 0 && item.vatRateBasisPoints !== 1700) {
      throw unprocessableEntity({ code: 'invalid_vat_rate' });
    }
  }

  // Finalize in a transaction
  return db.transaction(async (tx) => {
    const { sequenceNumber, fullNumber } = await assignInvoiceNumber(
      tx,
      businessId,
      invoice.documentType,
      business.invoiceNumberPrefix ?? '',
      business.startingInvoiceNumber
    );

    // Recalculate totals
    const lineInputs = items.map((i) => ({
      quantity: Number(i.quantity),
      unitPriceAgora: i.unitPriceAgora,
      discountPercent: Number(i.discountPercent),
      vatRateBasisPoints: i.vatRateBasisPoints,
    }));
    const totals = calculateInvoiceTotals(lineInputs);

    // Recalculate individual line items and update them
    await deleteItemsByInvoiceId(invoiceId, tx);
    const updatedItems = await insertItems(
      items.map((i) => {
        const line = calculateLine({
          quantity: Number(i.quantity),
          unitPriceAgora: i.unitPriceAgora,
          discountPercent: Number(i.discountPercent),
          vatRateBasisPoints: i.vatRateBasisPoints,
        });
        return {
          invoiceId,
          position: i.position,
          description: i.description,
          catalogNumber: i.catalogNumber,
          quantity: i.quantity,
          unitPriceAgora: i.unitPriceAgora,
          discountPercent: i.discountPercent,
          vatRateBasisPoints: i.vatRateBasisPoints,
          lineTotalAgora: line.lineTotalAgora,
          vatAmountAgora: line.vatAmountAgora,
          lineTotalInclVatAgora: line.lineTotalInclVatAgora,
        };
      }),
      tx
    );

    // Build customer address snapshot
    const addressParts = [customer.streetAddress, customer.city, customer.postalCode].filter(
      Boolean
    );
    const customerAddress = addressParts.length > 0 ? addressParts.join(', ') : null;

    const now = new Date();
    const updated = await updateInvoice(
      invoiceId,
      businessId,
      {
        status: 'finalized',
        sequenceNumber,
        fullNumber,
        sequenceGroup: documentTypeToSequenceGroup(invoice.documentType),
        invoiceDate,
        issuedAt: now,
        customerName: customer.name,
        customerTaxId: customer.taxId ?? null,
        customerAddress,
        customerEmail: customer.email ?? null,
        ...totals,
        updatedAt: now,
      } as Parameters<typeof updateInvoice>[2],
      tx
    );
    if (!updated) throw notFound();

    return buildResponse(updated, updatedItems);
  });
}
