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
  findCreditNotesBySourceInvoiceId,
  type InvoiceRecord,
  type InvoiceItemRecord,
  type InvoiceInsert,
  type InvoiceListFilters,
} from '../repositories/invoice-repository.js';
import {
  insertPayment,
  findPaymentsByInvoiceId,
  findPaymentById,
  deletePaymentById,
  sumPaymentsByInvoiceId,
} from '../repositories/payment-repository.js';
import { findCustomerById } from '../repositories/customer-repository.js';
import { findBusinessById } from '../repositories/business-repository.js';
import type { CustomerRecord } from '../repositories/customer-repository.js';
import type { PaymentRecord } from '../repositories/payment-repository.js';
import { AppError, notFound, unprocessableEntity } from '../lib/app-error.js';
import { assignInvoiceNumber, documentTypeToSequenceGroup } from '../lib/invoice-sequences.js';
import {
  serializeInvoice,
  serializeInvoiceItem,
  serializeInvoiceListItem,
  serializePayment,
} from '../lib/invoice-serializers.js';
import { toNumber } from '../lib/numeric.js';
import { calculateLine, calculateInvoiceTotals, STANDARD_VAT_RATE_BP } from '@bon/types/vat';
import { sendJob, withTransactionalJob } from '../jobs/boss.js';
import type { PgBoss } from 'pg-boss';
import type { FastifyBaseLogger } from 'fastify';
import { db } from '../db/client.js';
import { pool } from '../db/client.js';
import type {
  InvoiceResponse,
  InvoiceListQuery,
  InvoiceListResponse,
  LineItemInput,
  DocumentType,
  CreateCreditNoteBody,
} from '@bon/types/invoices';
import type { RecordPaymentBody } from '@bon/types/payments';
import { shouldRequestAllocation } from '@bon/types/shaam';

export interface FinalizeResult extends InvoiceResponse {
  needsAllocation: boolean;
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

function buildResponse(
  invoice: InvoiceRecord,
  itemRecords: InvoiceItemRecord[],
  paymentRecords: PaymentRecord[] = [],
  paidTotal = 0
): InvoiceResponse {
  return {
    invoice: serializeInvoice(invoice),
    items: itemRecords.map(serializeInvoiceItem),
    payments: paymentRecords.map(serializePayment),
    remainingBalanceMinorUnits: Math.max(0, invoice.totalInclVatMinorUnits - paidTotal),
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

function validateVatRates(
  items: ReadonlyArray<{ vatRateBasisPoints: number }>,
  isExemptDealer: boolean
) {
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

  const [items, payments, paidTotal, creditNotes] = await Promise.all([
    findItemsByInvoiceId(invoiceId),
    findPaymentsByInvoiceId(invoiceId),
    sumPaymentsByInvoiceId(invoiceId),
    findCreditNotesBySourceInvoiceId(invoiceId, businessId),
  ]);

  const response = buildResponse(invoice, items, payments, paidTotal);

  // Back-link: if this is a credit note, include the source invoice's document number
  let creditedInvoiceDocumentNumber: string | null = null;
  if (invoice.creditedInvoiceId) {
    const source = await findInvoiceById(invoice.creditedInvoiceId, businessId);
    creditedInvoiceDocumentNumber = source?.documentNumber ?? null;
  }

  return {
    ...response,
    creditedInvoiceDocumentNumber,
    creditNotes: creditNotes.map((cn) => ({
      id: cn.id,
      documentNumber: cn.documentNumber ?? null,
    })),
  };
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
): Promise<FinalizeResult> {
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
    const invoiceDate = body.invoiceDate ?? invoice.invoiceDate;
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

    // 7. Check if SHAAM allocation is needed
    const needsAllocation = shouldRequestAllocation(
      {
        vatMinorUnits: totals.vatMinorUnits,
        totalExclVatMinorUnits: totals.totalExclVatMinorUnits,
      },
      customer,
      new Date(invoiceDate)
    );

    // 8. Update invoice
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
        ...(needsAllocation ? { allocationStatus: 'pending' } : {}),
        ...snapshot,
        ...totals,
        updatedAt: now,
      },
      tx
    );
    if (!updated) throw notFound();

    return { ...buildResponse(updated, updatedItems), needsAllocation };
  });
}

const SENDABLE_STATUSES = new Set(['finalized', 'sent', 'partially_paid']);

export async function sendInvoice(
  businessId: string,
  invoiceId: string,
  body: { recipientEmail?: string | undefined },
  boss: PgBoss | undefined
): Promise<{ status: 'sending' | 'sent' }> {
  const invoice = await findInvoiceById(invoiceId, businessId);
  if (!invoice) throw notFound();

  if (!SENDABLE_STATUSES.has(invoice.status)) {
    throw unprocessableEntity({ code: 'not_sendable' });
  }

  const recipientEmail = (body.recipientEmail ?? invoice.customerEmail)?.trim();
  if (!recipientEmail) {
    throw unprocessableEntity({ code: 'missing_email' });
  }

  if (!boss) {
    throw new AppError({
      statusCode: 503,
      code: 'job_queue_unavailable',
      message: 'Background job queue is not available',
    });
  }

  // Atomically set status to 'sending' and enqueue the email job
  await withTransactionalJob(pool, boss, async (tx, jobDb) => {
    const { invoices } = await import('../db/schema.js');
    const { eq, and } = await import('drizzle-orm');

    await tx
      .update(invoices)
      .set({ status: 'sending', updatedAt: new Date() })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, businessId)));

    await boss.send(
      'send-invoice-email',
      { invoiceId, businessId, recipientEmail },
      {
        db: jobDb,
        singletonKey: invoiceId,
        retryLimit: 3,
        retryDelay: 30,
        retryBackoff: true,
        expireInSeconds: 600,
      }
    );
  });

  return { status: 'sending' };
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

// ── credit note ──

const CREDITABLE_STATUSES = new Set(['finalized', 'sent', 'paid', 'partially_paid']);

export interface CreditNoteResult extends InvoiceResponse {
  needsAllocation: boolean;
}

function validateCreditLines(
  creditItems: readonly LineItemInput[],
  sourceItems: InvoiceItemRecord[]
) {
  for (const credit of creditItems) {
    const source = sourceItems.find((s) => s.position === credit.position);
    if (!source) {
      throw unprocessableEntity({ code: 'invalid_credit_line' });
    }
    if (credit.quantity > toNumber(source.quantity)) {
      throw unprocessableEntity({ code: 'invalid_credit_line' });
    }
    if (credit.unitPriceMinorUnits > source.unitPriceMinorUnits) {
      throw unprocessableEntity({ code: 'invalid_credit_line' });
    }
  }
}

export async function createCreditNote(
  businessId: string,
  sourceInvoiceId: string,
  body: CreateCreditNoteBody
): Promise<CreditNoteResult> {
  return db.transaction(async (tx) => {
    const sourceInvoice = await findInvoiceByIdForUpdate(sourceInvoiceId, businessId, tx);
    if (!sourceInvoice) throw notFound();

    if (!CREDITABLE_STATUSES.has(sourceInvoice.status)) {
      throw unprocessableEntity({ code: 'invoice_not_creditable' });
    }

    if (sourceInvoice.documentType === 'credit_note') {
      throw unprocessableEntity({ code: 'cannot_credit_credit_note' });
    }

    const business = await findBusinessById(businessId, tx);
    if (!business) throw notFound();

    const isExemptDealer = business.businessType === 'exempt_dealer';

    validateVatRates(body.items, isExemptDealer);

    const sourceItems = await findItemsByInvoiceId(sourceInvoiceId, tx);
    validateCreditLines(body.items, sourceItems);

    const totals = computeTotals(body.items);

    const invoiceDate = body.invoiceDate ?? todayDateString();
    const maxDateStr = maxFutureDateString(7);
    if (invoiceDate > maxDateStr) {
      throw unprocessableEntity({ code: 'invalid_invoice_date' });
    }

    // Copy customer snapshot from source invoice
    const snapshot = {
      customerName: sourceInvoice.customerName,
      customerTaxId: sourceInvoice.customerTaxId,
      customerAddress: sourceInvoice.customerAddress,
      customerEmail: sourceInvoice.customerEmail,
    };

    // Assign sequence number from credit_note group
    const { sequenceNumber, documentNumber } = await assignInvoiceNumber(
      tx,
      businessId,
      'credit_note',
      business.invoiceNumberPrefix ?? '',
      business.startingInvoiceNumber
    );

    // Check SHAAM allocation need — use source invoice's customer for threshold check
    const customer = sourceInvoice.customerId
      ? await findCustomerById(sourceInvoice.customerId, businessId, tx)
      : null;

    const needsAllocation = customer
      ? shouldRequestAllocation(
          {
            vatMinorUnits: totals.vatMinorUnits,
            totalExclVatMinorUnits: totals.totalExclVatMinorUnits,
          },
          customer,
          new Date(invoiceDate)
        )
      : false;

    const now = new Date();
    const creditNote = await insertInvoice(
      {
        businessId,
        documentType: 'credit_note',
        customerId: sourceInvoice.customerId,
        creditedInvoiceId: sourceInvoiceId,
        status: 'finalized',
        sequenceGroup: 'credit_note',
        sequenceNumber,
        documentNumber,
        invoiceDate,
        issuedAt: now,
        dueDate: null,
        notes: body.notes ?? null,
        internalNotes: null,
        currency: sourceInvoice.currency,
        vatExemptionReason: sourceInvoice.vatExemptionReason,
        ...snapshot,
        ...totals,
        ...(needsAllocation ? { allocationStatus: 'pending' } : {}),
        createdAt: now,
        updatedAt: now,
      },
      tx
    );
    if (!creditNote) throw new Error('Failed to create credit note');

    // Insert line items with proper invoiceId
    const creditItems = await insertItems(
      body.items.map((item) => buildItemInsert(creditNote.id, item)),
      tx
    );

    // Only mark source as 'credited' when the credit note fully reverses it
    const isFullCredit = totals.totalInclVatMinorUnits === sourceInvoice.totalInclVatMinorUnits;
    if (isFullCredit) {
      await updateInvoice(sourceInvoiceId, businessId, { status: 'credited', updatedAt: now }, tx);
    }

    return { ...buildResponse(creditNote, creditItems), needsAllocation };
  });
}

// ── SHAAM allocation ──

export function enqueueShaamAllocation(
  boss: PgBoss,
  businessId: string,
  invoiceId: string,
  log: FastifyBaseLogger
): void {
  sendJob(
    boss,
    'shaam-allocation-request',
    { businessId, invoiceId },
    {
      singletonKey: invoiceId,
      retryLimit: 5,
      retryDelay: 60,
      retryBackoff: true,
      expireInSeconds: 1800,
    }
  ).catch((err: unknown) => {
    log.error({ err, invoiceId }, 'Failed to enqueue SHAAM allocation job');
  });
}

// ── payment methods ──

const PAYABLE_STATUSES = new Set(['finalized', 'sent', 'partially_paid']);
const PAYMENT_DELETABLE_STATUSES = new Set(['finalized', 'sent', 'partially_paid', 'paid']);

export async function recordPayment(
  businessId: string,
  invoiceId: string,
  body: RecordPaymentBody,
  recordedByUserId: string
): Promise<InvoiceResponse> {
  return db.transaction(async (tx) => {
    const invoice = await findInvoiceByIdForUpdate(invoiceId, businessId, tx);
    if (!invoice) throw notFound({ code: 'invoice_not_found' });

    if (!PAYABLE_STATUSES.has(invoice.status)) {
      throw unprocessableEntity({ code: 'invoice_not_payable' });
    }

    const paidSoFar = await sumPaymentsByInvoiceId(invoiceId, tx);
    const remaining = invoice.totalInclVatMinorUnits - paidSoFar;

    if (body.amountMinorUnits > remaining) {
      throw unprocessableEntity({ code: 'payment_exceeds_balance' });
    }

    await insertPayment(
      {
        invoiceId,
        amountMinorUnits: body.amountMinorUnits,
        paidAt: body.paidAt,
        method: body.method,
        reference: body.reference ?? null,
        notes: body.notes ?? null,
        recordedByUserId,
      },
      tx
    );

    const newPaidTotal = paidSoFar + body.amountMinorUnits;
    const isFullyPaid = newPaidTotal >= invoice.totalInclVatMinorUnits;

    const now = new Date();
    const statusUpdates: Partial<InvoiceInsert> = {
      status: isFullyPaid ? 'paid' : 'partially_paid',
      updatedAt: now,
    };

    if (isFullyPaid) {
      statusUpdates.paidAt = now;
      if (invoice.isOverdue) {
        statusUpdates.isOverdue = false;
      }
    }

    const updated = await updateInvoice(invoiceId, businessId, statusUpdates, tx);
    if (!updated) throw notFound();

    const [items, payments] = await Promise.all([
      findItemsByInvoiceId(invoiceId, tx),
      findPaymentsByInvoiceId(invoiceId, tx),
    ]);

    return buildResponse(updated, items, payments, newPaidTotal);
  });
}

export async function deletePayment(
  businessId: string,
  invoiceId: string,
  paymentId: string
): Promise<InvoiceResponse> {
  return db.transaction(async (tx) => {
    const invoice = await findInvoiceByIdForUpdate(invoiceId, businessId, tx);
    if (!invoice) throw notFound({ code: 'invoice_not_found' });

    if (!PAYMENT_DELETABLE_STATUSES.has(invoice.status)) {
      throw unprocessableEntity({ code: 'cannot_delete_payment' });
    }

    const payment = await findPaymentById(paymentId, invoiceId, tx);
    if (!payment) throw notFound({ code: 'payment_not_found' });

    await deletePaymentById(paymentId, invoiceId, tx);

    const newPaidTotal = await sumPaymentsByInvoiceId(invoiceId, tx);
    const now = new Date();
    const statusUpdates: Partial<InvoiceInsert> = { updatedAt: now };

    if (newPaidTotal <= 0) {
      // No payments remain — restore pre-payment status
      statusUpdates.status = invoice.sentAt ? 'sent' : 'finalized';
      statusUpdates.paidAt = null;
    } else if (newPaidTotal < invoice.totalInclVatMinorUnits) {
      statusUpdates.status = 'partially_paid';
      statusUpdates.paidAt = null;
    }
    // If still fully paid (shouldn't happen on delete, but safe)

    const updated = await updateInvoice(invoiceId, businessId, statusUpdates, tx);
    if (!updated) throw notFound();

    const [items, payments] = await Promise.all([
      findItemsByInvoiceId(invoiceId, tx),
      findPaymentsByInvoiceId(invoiceId, tx),
    ]);

    return buildResponse(updated, items, payments, newPaidTotal);
  });
}

export async function listPayments(businessId: string, invoiceId: string) {
  const invoice = await findInvoiceById(invoiceId, businessId);
  if (!invoice) throw notFound({ code: 'invoice_not_found' });

  const payments = await findPaymentsByInvoiceId(invoiceId);
  return payments.map(serializePayment);
}
