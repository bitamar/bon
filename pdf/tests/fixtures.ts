import type { PdfRenderInput } from '@bon/types/pdf';

export function makeBusiness(
  overrides: Partial<PdfRenderInput['business']> = {}
): PdfRenderInput['business'] {
  return {
    name: '\u05D7\u05D1\u05E8\u05EA \u05D1\u05D3\u05D9\u05E7\u05D4',
    businessType: 'licensed_dealer',
    registrationNumber: '123456789',
    vatNumber: '987654321',
    streetAddress: '\u05E8\u05D5\u05D8\u05E9\u05D9\u05DC\u05D3 1',
    city: '\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1',
    postalCode: '6688101',
    phone: '0501234567',
    email: 'test@example.com',
    logoUrl: null,
    ...overrides,
  };
}

export function makeInvoice(
  overrides: Partial<PdfRenderInput['invoice']> = {}
): PdfRenderInput['invoice'] {
  return {
    id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    businessId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
    customerId: 'c3d4e5f6-a7b8-4c9d-ae1f-2a3b4c5d6e7f',
    customerName: '\u05DC\u05E7\u05D5\u05D7 \u05D8\u05E1\u05D8',
    customerTaxId: '111111111',
    customerAddress: '\u05D4\u05E8\u05E6\u05DC 10, \u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD',
    customerEmail: 'customer@example.com',
    documentType: 'tax_invoice',
    status: 'finalized',
    isOverdue: false,
    sequenceGroup: 'tax_document',
    sequenceNumber: 42,
    documentNumber: 'INV-0042',
    creditedInvoiceId: null,
    invoiceDate: '2026-03-01',
    issuedAt: '2026-03-01T10:00:00.000Z',
    dueDate: '2026-03-31',
    notes: '\u05D4\u05E2\u05E8\u05D4 \u05DC\u05D3\u05D5\u05D2\u05DE\u05D4',
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
    createdAt: '2026-03-01T09:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
    ...overrides,
  };
}

export function makeItem(
  overrides: Partial<PdfRenderInput['items'][number]> = {}
): PdfRenderInput['items'][number] {
  return {
    id: 'd4e5f6a7-b8c9-4d0e-af2a-3b4c5d6e7f80',
    invoiceId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    position: 0,
    description: '\u05E9\u05D9\u05E8\u05D5\u05EA \u05D9\u05D9\u05E2\u05D5\u05E5',
    catalogNumber: null,
    quantity: 1,
    unitPriceMinorUnits: 10000,
    discountPercent: 0,
    vatRateBasisPoints: 1700,
    lineTotalMinorUnits: 10000,
    vatAmountMinorUnits: 1700,
    lineTotalInclVatMinorUnits: 11700,
    ...overrides,
  };
}

export function makeInput(overrides: Partial<PdfRenderInput> = {}): PdfRenderInput {
  return {
    business: makeBusiness(),
    invoice: makeInvoice(),
    items: [makeItem()],
    isDraft: false,
    ...overrides,
  };
}
