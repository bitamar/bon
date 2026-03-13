import { toNumber } from './numeric.js';
import type { Invoice, LineItem } from '@bon/types/invoices';
import type { Payment } from '@bon/types/payments';
import type { InvoiceRecord, InvoiceItemRecord } from '../repositories/invoice-repository.js';
import type { PaymentRecord } from '../repositories/payment-repository.js';

export function serializeInvoice(record: InvoiceRecord): Invoice {
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
    invoiceDate: record.invoiceDate,
    issuedAt: record.issuedAt ? record.issuedAt.toISOString() : null,
    dueDate: record.dueDate ?? null,
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

export function serializeInvoiceItem(record: InvoiceItemRecord): LineItem {
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

export function serializePayment(record: PaymentRecord): Payment {
  return {
    id: record.id,
    invoiceId: record.invoiceId,
    amountMinorUnits: record.amountMinorUnits,
    paidAt: record.paidAt,
    method: record.method,
    reference: record.reference ?? null,
    notes: record.notes ?? null,
    recordedByUserId: record.recordedByUserId,
    createdAt: record.createdAt.toISOString(),
  };
}
