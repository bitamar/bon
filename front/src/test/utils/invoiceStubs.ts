import type { Invoice, InvoiceResponse } from '@bon/types/invoices';

const BASE_LINE_ITEM = {
  id: 'item-1',
  invoiceId: 'inv-1',
  position: 0,
  description: 'שירות ייעוץ',
  catalogNumber: null,
  quantity: 1,
  unitPriceMinorUnits: 10000,
  discountPercent: 0,
  vatRateBasisPoints: 1700,
  lineTotalMinorUnits: 10000,
  vatAmountMinorUnits: 1700,
  lineTotalInclVatMinorUnits: 11700,
};

const BASE_INVOICE: Invoice = {
  id: 'inv-1',
  businessId: 'biz-1',
  customerId: null,
  customerName: null,
  customerTaxId: null,
  customerAddress: null,
  customerEmail: null,
  documentType: 'tax_invoice',
  status: 'draft',
  isOverdue: false,
  sequenceGroup: null,
  sequenceNumber: null,
  documentNumber: null,
  creditedInvoiceId: null,
  invoiceDate: '2026-02-20',
  issuedAt: null,
  dueDate: null,
  notes: null,
  internalNotes: null,
  currency: 'ILS',
  vatExemptionReason: null,
  subtotalMinorUnits: 10000,
  discountMinorUnits: 0,
  totalExclVatMinorUnits: 10000,
  vatMinorUnits: 1700,
  totalInclVatMinorUnits: 11700,
  allocationStatus: null,
  allocationNumber: null,
  allocationError: null,
  sentAt: null,
  paidAt: null,
  createdAt: '2026-02-20T00:00:00.000Z',
  updatedAt: '2026-02-20T00:00:00.000Z',
};

export function makeDraftInvoice(overrides: Partial<Invoice> = {}): InvoiceResponse {
  return {
    invoice: {
      ...BASE_INVOICE,
      invoiceDate: '2026-02-23',
      notes: 'הערה לדוגמה',
      createdAt: '2026-02-23T00:00:00.000Z',
      updatedAt: '2026-02-23T00:00:00.000Z',
      ...overrides,
    },
    items: [{ ...BASE_LINE_ITEM }],
  };
}

export function makeFinalizedInvoice(overrides: Partial<Invoice> = {}): InvoiceResponse {
  return {
    invoice: {
      ...BASE_INVOICE,
      customerId: 'cust-1',
      customerName: 'לקוח לדוגמה',
      customerTaxId: '123456782',
      customerAddress: 'רחוב הרצל 1, תל אביב',
      customerEmail: 'test@example.com',
      status: 'finalized',
      sequenceGroup: 'tax_document',
      sequenceNumber: 1,
      documentNumber: 'INV-0001',
      issuedAt: '2026-02-20T10:30:00.000Z',
      dueDate: '2026-03-20',
      notes: 'הערה לדוגמה',
      updatedAt: '2026-02-20T10:30:00.000Z',
      ...overrides,
    },
    items: [{ ...BASE_LINE_ITEM }],
  };
}
