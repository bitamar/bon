import {
  ITA_DOCUMENT_TYPE_CODES,
  type ItaRequestPayload,
  type ItaLineItem,
} from '@bon/types/shaam';

export interface BuildItaInvoiceData {
  readonly id: string;
  readonly businessId: string;
  readonly documentType: string;
  readonly documentNumber: string | null;
  readonly invoiceDate: string;
  readonly customerName: string | null;
  readonly customerTaxId: string | null;
  readonly totalExclVatMinorUnits: number;
  readonly vatMinorUnits: number;
  readonly totalInclVatMinorUnits: number;
  readonly currency: string;
}

export interface BuildItaLineItemData {
  readonly position: number;
  readonly description: string;
  readonly quantity: number;
  readonly unitPriceMinorUnits: number;
  readonly discountPercent: number;
  readonly vatRateBasisPoints: number;
  readonly lineTotalMinorUnits: number;
  readonly vatAmountMinorUnits: number;
  readonly lineTotalInclVatMinorUnits: number;
}

export interface BuildItaBusinessData {
  readonly vatNumber: string | null;
  readonly softwareRegistrationNumber?: string | undefined;
}

/**
 * Minor units (agorot) → major units (shekels) with 2 decimal places.
 */
function toMajor(minorUnits: number): number {
  return minorUnits / 100;
}

/**
 * VAT basis points → percentage (e.g. 1700 → 17).
 */
function bpToPercent(basisPoints: number): number {
  return basisPoints / 100;
}

/**
 * Builds the ITA SHAAM allocation request payload from our internal data model.
 *
 * Maps ~26 required fields per ITA spec (Table 2.1 for invoice header,
 * Table 2.2 for line items). All amounts are converted from minor units
 * (integer agorot) to major units (decimal shekels).
 */
export function buildItaPayload(
  invoice: BuildItaInvoiceData,
  lineItems: readonly BuildItaLineItemData[],
  business: BuildItaBusinessData
): ItaRequestPayload {
  const documentTypeCode =
    ITA_DOCUMENT_TYPE_CODES[invoice.documentType as keyof typeof ITA_DOCUMENT_TYPE_CODES];

  if (documentTypeCode === undefined) {
    throw new Error(`Unknown document type: ${invoice.documentType}`);
  }

  const sorted = [...lineItems].sort((a, b) => a.position - b.position);
  const itaLineItems: ItaLineItem[] = sorted.map((item, index) => ({
    LineNumber: index + 1,
    Description: item.description,
    Quantity: item.quantity,
    UnitPrice: toMajor(item.unitPriceMinorUnits),
    Discount: item.discountPercent,
    TotalLineBefore: toMajor(item.lineTotalMinorUnits),
    VatRate: bpToPercent(item.vatRateBasisPoints),
    VatAmount: toMajor(item.vatAmountMinorUnits),
    TotalLineAfter: toMajor(item.lineTotalInclVatMinorUnits),
  }));

  const payload: ItaRequestPayload = {
    InvoiceType: documentTypeCode,
    VatNumber: business.vatNumber ?? '',
    InvoiceNumber: invoice.documentNumber ?? '',
    InvoiceDate: invoice.invoiceDate,
    ClientName: invoice.customerName ?? '',
    DealAmount: toMajor(invoice.totalExclVatMinorUnits),
    VatAmount: toMajor(invoice.vatMinorUnits),
    TotalAmount: toMajor(invoice.totalInclVatMinorUnits),
    Currency: invoice.currency,
    LineItems: itaLineItems,
  };

  if (invoice.customerTaxId) {
    payload.ClientVatNumber = invoice.customerTaxId;
  }

  if (business.softwareRegistrationNumber) {
    payload.AccountingSoftwareNumber = business.softwareRegistrationNumber;
  }

  return payload;
}
