import {
  insertInvoice,
  findInvoiceById,
  findInvoiceByIdForUpdate,
  updateInvoice,
  deleteInvoice,
  insertItems,
  deleteItemsByInvoiceId,
  findItemsByInvoiceId,
  findInvoices,
  countInvoices,
  aggregateOutstanding,
  aggregateFiltered,
  type InvoiceRecord,
  type InvoiceItemRecord,
  type InvoiceInsert,
  type InvoiceListFilters,
} from '../repositories/invoice-repository.js';
import { findCustomerById } from '../repositories/customer-repository.js';
import { findBusinessById } from '../repositories/business-repository.js';
import type { CustomerRecord } from '../repositories/customer-repository.js';
import { notFound, unprocessableEntity } from '../lib/app-error.js';
import { assignInvoiceNumber, documentTypeToSequenceGroup } from '../lib/invoice-sequences.js';
import { toNumber } from '../lib/numeric.js';
import { calculateLine, calculateInvoiceTotals, STANDARD_VAT_RATE_BP } from '@bon/types/vat';
import { db } from '../db/client.js';
import type {
  Invoice,
  LineItem,
  InvoiceResponse,
  InvoiceListItem,
  InvoiceListQuery,
  InvoiceListResponse,
  LineItemInput,
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
    documentNumber: record.documentNumber ?? null,
    creditedInvoiceId: record.creditedInvoiceId ?? null,
    invoiceDate: coerceToDateString(record.invoiceDate),
    issuedAt: record.issuedAt ? record.issuedAt.toISOString() : null,
    dueDate: record.dueDate ? coerceToDateString(record.dueDate) : null,
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

function serializeInvoiceItem(record: InvoiceItemRecord): LineItem {
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

function serializeInvoiceListItem(
  record: Pick<
    InvoiceRecord,
    | 'id'
    | 'businessId'
    | 'customerId'
    | 'customerName'
    | 'documentType'
    | 'status'
    | 'isOverdue'
    | 'sequenceGroup'
    | 'documentNumber'
    | 'invoiceDate'
    | 'dueDate'
    | 'totalInclVatMinorUnits'
    | 'currency'
    | 'createdAt'
  >
): InvoiceListItem {
  return {
    id: record.id,
    businessId: record.businessId,
    customerId: record.customerId ?? null,
    customerName: record.customerName ?? null,
    documentType: record.documentType,
    status: record.status,
    isOverdue: record.isOverdue,
    sequenceGroup: record.sequenceGroup ?? null,
    documentNumber: record.documentNumber ?? null,
    invoiceDate: coerceToDateString(record.invoiceDate),
    dueDate: record.dueDate ? coerceToDateString(record.dueDate) : null,
    totalInclVatMinorUnits: record.totalInclVatMinorUnits,
    currency: record.currency,
    createdAt: record.createdAt.toISOString(),
  };
}

// ── helpers ──

function buildItemInsert(invoiceId: string, item: LineItemInput) {
  const line = calculateLine({
    quantity: item.quantity,
    unitPriceMinorUnits: item.unitPriceMinorUnits,
    discountPercent: item.discountPercent,
    vatRateBasisPoints: item.vatRateBasisPoints,
  });
  return {
    invoiceId,
    position: item.position,
    description: item.description,
    catalogNumber: item.catalogNumber ?? null,
    quantity: String(item.quantity),
    unitPriceMinorUnits: item.unitPriceMinorUnits,
    discountPercent: String(item.discountPercent),
    vatRateBasisPoints: item.vatRateBasisPoints,
    lineTotalMinorUnits: line.lineTotalMinorUnits,
    vatAmountMinorUnits: line.vatAmountMinorUnits,
    lineTotalInclVatMinorUnits: line.lineTotalInclVatMinorUnits,
  };
}

function computeTotals(items: LineItemInput[]) {
  return calculateInvoiceTotals(
    items.map((i) => ({
      quantity: i.quantity,
      unitPriceMinorUnits: i.unitPriceMinorUnits,
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

function toLineInput(record: InvoiceItemRecord) {
  return {
    quantity: toNumber(record.quantity),
    unitPriceMinorUnits: record.unitPriceMinorUnits,
    discountPercent: toNumber(record.discountPercent),
    vatRateBasisPoints: record.vatRateBasisPoints,
  };
}

function validateVatRates(items: InvoiceItemRecord[], isExemptDealer: boolean) {
  for (const item of items) {
    if (isExemptDealer && item.vatRateBasisPoints !== 0) {
      throw unprocessableEntity({ code: 'invalid_vat_rate' });
    }
    if (
      !isExemptDealer &&
      item.vatRateBasisPoints !== 0 &&
      item.vatRateBasisPoints !== STANDARD_VAT_RATE_BP
    ) {
      throw unprocessableEntity({ code: 'invalid_vat_rate' });
    }
  }
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
  items?: LineItemInput[] | undefined;
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
  invoiceDate?: string | undefined;
  dueDate?: string | null | undefined;
  notes?: string | null | undefined;
  internalNotes?: string | null | undefined;
  items?: LineItemInput[] | undefined;
};

export async function updateDraft(businessId: string, invoiceId: string, input: UpdateDraftInput) {
  return db.transaction(async (tx) => {
    const existing = await findInvoiceByIdForUpdate(invoiceId, businessId, tx);
    if (!existing) throw notFound();
    if (existing.status !== 'draft') {
      throw unprocessableEntity({ code: 'not_draft' });
    }

    const now = new Date();
    const updates: Partial<InvoiceInsert> = {
      updatedAt: now,
      ...(input.customerId !== undefined && { customerId: input.customerId }),
      ...(input.documentType !== undefined && { documentType: input.documentType }),
      ...(input.invoiceDate != null && { invoiceDate: input.invoiceDate }),
      ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.internalNotes !== undefined && { internalNotes: input.internalNotes }),
    };

    if (input.items !== undefined) {
      await deleteItemsByInvoiceId(invoiceId, tx);
      if (input.items.length > 0) {
        await insertItems(
          input.items.map((i) => buildItemInsert(invoiceId, i)),
          tx
        );
        const totals = computeTotals(input.items);
        Object.assign(updates, totals);
      } else {
        Object.assign(updates, {
          subtotalMinorUnits: 0,
          discountMinorUnits: 0,
          totalExclVatMinorUnits: 0,
          vatMinorUnits: 0,
          totalInclVatMinorUnits: 0,
        });
      }
    }

    const updated = await updateInvoice(invoiceId, businessId, updates, tx);
    if (!updated) throw notFound();

    const items = await findItemsByInvoiceId(invoiceId, tx);
    return buildResponse(updated, items);
  });
}

export async function deleteDraft(businessId: string, invoiceId: string) {
  await db.transaction(async (tx) => {
    const existing = await findInvoiceByIdForUpdate(invoiceId, businessId, tx);
    if (!existing) throw notFound();
    if (existing.status !== 'draft') {
      throw unprocessableEntity({ code: 'not_draft' });
    }

    await deleteInvoice(invoiceId, businessId, tx);
  });
}

function buildFinalizationSnapshot(
  customer: CustomerRecord | null,
  body: { vatExemptionReason?: string | undefined }
) {
  if (!customer) {
    return {
      customerName: null,
      customerTaxId: null,
      customerAddress: null,
      customerEmail: null,
      vatExemptionReason: body.vatExemptionReason ?? null,
    };
  }

  const addressParts = [customer.streetAddress, customer.city, customer.postalCode].filter(Boolean);
  const customerAddress = addressParts.length > 0 ? addressParts.join(', ') : null;

  return {
    customerName: customer.name,
    customerTaxId: customer.taxId ?? null,
    customerAddress,
    customerEmail: customer.email ?? null,
    vatExemptionReason: body.vatExemptionReason ?? null,
  };
}

export async function finalize(
  businessId: string,
  invoiceId: string,
  body: { invoiceDate?: string | undefined; vatExemptionReason?: string | undefined }
) {
  return db.transaction(async (tx) => {
    // 1. Lock the invoice row — prevents double-finalization and concurrent edits
    //    racing with finalization.
    const invoice = await findInvoiceByIdForUpdate(invoiceId, businessId, tx);
    if (!invoice) throw notFound();
    if (invoice.status !== 'draft') {
      throw unprocessableEntity({ code: 'not_draft' });
    }

    // 2. Read related data inside tx (READ COMMITTED — sees committed changes)
    if (!invoice.customerId) {
      throw unprocessableEntity({ code: 'missing_customer' });
    }
    const customer = await findCustomerById(invoice.customerId, businessId, tx);
    if (!customer) {
      throw unprocessableEntity({ code: 'customer_not_found' });
    }
    if (!customer.isActive) {
      throw unprocessableEntity({ code: 'customer_inactive' });
    }

    const items = await findItemsByInvoiceId(invoiceId, tx);
    if (items.length === 0) {
      throw unprocessableEntity({ code: 'no_line_items' });
    }

    // Validate invoice date
    const invoiceDate = body.invoiceDate ?? coerceToDateString(invoice.invoiceDate);
    const maxDateStr = maxFutureDateString(7);
    if (invoiceDate > maxDateStr) {
      throw unprocessableEntity({ code: 'invalid_invoice_date' });
    }

    const business = await findBusinessById(businessId, tx);
    if (!business) throw notFound();

    // 3. Validate (consistent with the locked invoice state)
    const isExemptDealer = business.businessType === 'exempt_dealer';
    validateVatRates(items, isExemptDealer);

    const lineInputs = items.map(toLineInput);
    const totals = calculateInvoiceTotals(lineInputs);
    if (totals.vatMinorUnits === 0 && !isExemptDealer && !body.vatExemptionReason) {
      throw unprocessableEntity({ code: 'missing_vat_exemption_reason' });
    }

    // 4. Recalculate individual line items and update them
    await deleteItemsByInvoiceId(invoiceId, tx);
    const updatedItems = await insertItems(
      items.map((i) => {
        const line = calculateLine(toLineInput(i));
        return {
          invoiceId,
          position: i.position,
          description: i.description,
          catalogNumber: i.catalogNumber,
          quantity: i.quantity,
          unitPriceMinorUnits: i.unitPriceMinorUnits,
          discountPercent: i.discountPercent,
          vatRateBasisPoints: i.vatRateBasisPoints,
          lineTotalMinorUnits: line.lineTotalMinorUnits,
          vatAmountMinorUnits: line.vatAmountMinorUnits,
          lineTotalInclVatMinorUnits: line.lineTotalInclVatMinorUnits,
        };
      }),
      tx
    );

    // 5. Build snapshot — captures customer data at finalization time
    const snapshot = buildFinalizationSnapshot(customer, body);

    // 6. Assign sequence number (inside tx)
    const { sequenceNumber, documentNumber } = await assignInvoiceNumber(
      tx,
      businessId,
      invoice.documentType,
      business.invoiceNumberPrefix ?? '',
      business.startingInvoiceNumber
    );

    // 7. Update invoice
    const now = new Date();
    const updated = await updateInvoice(
      invoiceId,
      businessId,
      {
        status: 'finalized',
        sequenceNumber,
        documentNumber,
        sequenceGroup: documentTypeToSequenceGroup(invoice.documentType),
        invoiceDate,
        issuedAt: now,
        ...snapshot,
        ...totals,
        updatedAt: now,
      },
      tx
    );
    if (!updated) throw notFound();

    return buildResponse(updated, updatedItems);
  });
}

export async function listInvoices(
  businessId: string,
  query: InvoiceListQuery
): Promise<InvoiceListResponse> {
  const filters: InvoiceListFilters = {
    businessId,
    sort: query.sort,
    offset: (query.page - 1) * query.limit,
    limit: query.limit,
  };
  if (query.status) filters.status = query.status;
  if (query.customerId) filters.customerId = query.customerId;
  if (query.documentType) filters.documentType = query.documentType;
  if (query.dateFrom) filters.dateFrom = query.dateFrom;
  if (query.dateTo) filters.dateTo = query.dateTo;
  if (query.q) filters.q = query.q;

  const [rows, total, outstanding, filteredTotal] = await Promise.all([
    findInvoices(filters),
    countInvoices(filters),
    aggregateOutstanding(filters),
    aggregateFiltered(filters),
  ]);

  return {
    invoices: rows.map(serializeInvoiceListItem),
    total,
    aggregates: {
      totalOutstandingMinorUnits: outstanding.total,
      countOutstanding: outstanding.count,
      totalFilteredMinorUnits: filteredTotal,
    },
  };
}
