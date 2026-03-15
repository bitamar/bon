import * as iconv from 'iconv-lite';
import type { InvoiceRecord } from '../repositories/invoice-repository.js';
import { findBusinessById } from '../repositories/business-repository.js';
import { findInvoicesForReport } from '../repositories/invoice-repository.js';
import { unprocessableEntity, notFound } from '../lib/app-error.js';
import type { DocumentType } from '@bon/types/invoices';

// ── PCN874 constants ──

const ENTRY_TYPE_CODES: Record<DocumentType, string> = {
  tax_invoice: '01',
  tax_invoice_receipt: '02',
  receipt: '03',
  credit_note: '11',
};

const CRLF = '\r\n';

// ── helpers ──

function padNum(value: number, width: number): string {
  return String(Math.abs(value)).padStart(width, '0');
}

function sign(value: number): string {
  return value < 0 ? '-' : '+';
}

function formatDate(dateStr: string): string {
  // dateStr is YYYY-MM-DD → YYYYMMDD
  return dateStr.replaceAll('-', '');
}

function extractAllocationNumber(invoice: InvoiceRecord): string {
  if (
    (invoice.allocationStatus === 'approved' || invoice.allocationStatus === 'emergency') &&
    invoice.allocationNumber
  ) {
    return invoice.allocationNumber.slice(-9).padStart(9, '0');
  }
  return '000000000';
}

function customerVatNumber(invoice: InvoiceRecord): string {
  const taxId = invoice.customerTaxId;
  if (!taxId) return '000000000';
  const digits = taxId.replaceAll(/\D/g, '');
  return digits.padStart(9, '0').slice(-9);
}

function isCreditNote(invoice: InvoiceRecord): boolean {
  return invoice.documentType === 'credit_note';
}

function isZeroVat(invoice: InvoiceRecord): boolean {
  return invoice.vatMinorUnits === 0;
}

// ── record builders ──

function buildOpeningRecord(
  vatNumber: string,
  year: number,
  month: number,
  taxableAmount: number,
  taxableVat: number,
  exemptAmount: number,
  recordCount: number
): string {
  const period = `${year}${String(month).padStart(2, '0')}`;
  const today = new Date();
  const creationDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('');

  return [
    'O', // 1: record type
    vatNumber.padStart(9, '0'), // 2: VAT number
    period, // 3: reporting period YYYYMM
    '1', // 4: report type (regular)
    creationDate, // 5: file creation date
    sign(taxableAmount), // 6: sign taxable amount
    padNum(taxableAmount, 11), // 7: taxable amount
    sign(taxableVat), // 8: sign taxable VAT
    padNum(taxableVat, 9), // 9: taxable VAT
    sign(exemptAmount), // 10: sign exempt amount
    padNum(exemptAmount, 11), // 11: exempt amount
    '+', // 12: sign inputs (always +, BON is sales-only)
    '00000000000', // 13: inputs amount (zero)
    '+', // 14: sign inputs VAT
    '000000000', // 15: inputs VAT (zero)
    padNum(recordCount, 9), // 16: record count
  ].join('');
}

function buildDetailRecord(invoice: InvoiceRecord): string {
  const credit = isCreditNote(invoice);
  const amountSign = credit ? '-' : '+';
  const amount = invoice.totalExclVatMinorUnits;
  const vat = invoice.vatMinorUnits;

  return [
    'S', // 1: record type (sales)
    ENTRY_TYPE_CODES[invoice.documentType], // 2: entry type
    customerVatNumber(invoice), // 3: counterparty VAT number
    padNum(invoice.sequenceNumber ?? 0, 9), // 4: invoice number
    formatDate(invoice.invoiceDate), // 5: invoice date
    amountSign, // 6: amount sign
    padNum(amount, 11), // 7: amount excl. VAT
    amountSign, // 8: VAT sign
    padNum(vat, 9), // 9: VAT amount
    extractAllocationNumber(invoice), // 10: allocation number
  ].join('');
}

function buildClosingRecord(recordCount: number): string {
  return ['X', padNum(recordCount, 9)].join('');
}

// ── main export ──

export async function generatePcn874(
  businessId: string,
  year: number,
  month: number
): Promise<{ buffer: Buffer; filename: string }> {
  const business = await findBusinessById(businessId);
  if (!business) throw notFound({ message: 'Business not found' });

  if (business.businessType === 'exempt_dealer') {
    throw unprocessableEntity({
      message: 'עסק פטור אינו מדווח מע״מ',
      code: 'exempt_dealer_no_vat',
    });
  }

  const vatNumber = business.vatNumber ?? business.registrationNumber;

  // Query invoices for the period
  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const invoiceRows = await findInvoicesForReport(businessId, dateFrom, dateTo);

  // Calculate totals for opening record
  let taxableAmount = 0;
  let taxableVat = 0;
  let exemptAmount = 0;

  for (const inv of invoiceRows) {
    const multiplier = isCreditNote(inv) ? -1 : 1;
    if (isZeroVat(inv)) {
      exemptAmount += inv.totalExclVatMinorUnits * multiplier;
    } else {
      taxableAmount += inv.totalExclVatMinorUnits * multiplier;
      taxableVat += inv.vatMinorUnits * multiplier;
    }
  }

  // Build file lines
  const lines: string[] = [];
  lines.push(
    buildOpeningRecord(
      vatNumber,
      year,
      month,
      taxableAmount,
      taxableVat,
      exemptAmount,
      invoiceRows.length
    )
  );

  for (const inv of invoiceRows) {
    lines.push(buildDetailRecord(inv));
  }

  lines.push(buildClosingRecord(invoiceRows.length));

  const content = lines.join(CRLF) + CRLF;
  const buffer = iconv.encode(content, 'windows-1255');
  const period = `${year}${String(month).padStart(2, '0')}`;
  const filename = `PCN874_${vatNumber.padStart(9, '0')}_${period}.txt`;

  return { buffer, filename };
}
