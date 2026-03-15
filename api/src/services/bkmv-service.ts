// TODO: Output is currently UTF-8. ITA specification requires Windows-1255 (Hebrew) encoding.
// Add iconv-lite conversion in a follow-up ticket (T21).
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { businesses, invoiceItems, invoicePayments, invoices } from '../db/schema.js';
import { badRequest, notFound } from '../lib/app-error.js';
import type { DbOrTx } from '../db/types.js';

const FINALIZED_STATUSES = ['finalized', 'sent', 'paid', 'partially_paid', 'credited'] as const;

// Document type → C100 subsection code
const SUBSECTION_CODES: Record<string, string> = {
  tax_invoice: '305',
  tax_invoice_receipt: '305',
  credit_note: '330',
  receipt: '400',
};

// Payment method → D120 code
const PAYMENT_METHOD_CODES: Record<string, string> = {
  cash: '1',
  check: '2',
  credit: '3',
  transfer: '4',
  other: '5',
};

// ── Field formatting helpers ──

function padRight(value: string, width: number): string {
  return value.slice(0, width).padEnd(width);
}

function padLeft(value: string, width: number): string {
  return value.slice(0, width).padStart(width, '0');
}

function formatDate(dateStr: string): string {
  return dateStr.replaceAll('-', '');
}

function formatAmount(minorUnits: number): string {
  return padLeft(String(Math.abs(minorUnits)), 15);
}

function formatVatRate(basisPoints: number): string {
  const pct = (basisPoints / 100).toFixed(2);
  return padLeft(pct, 6);
}

function formatQuantity(quantity: string | number): string {
  const num = Number(quantity);
  return padLeft(num.toFixed(4), 12);
}

function formatDiscountPercent(pct: string | number): string {
  const num = Number(pct);
  return padLeft(num.toFixed(2), 6);
}

// ── Record builders ──

type InvoiceRow = typeof invoices.$inferSelect;
type InvoiceItemRow = typeof invoiceItems.$inferSelect;
type InvoicePaymentRow = typeof invoicePayments.$inferSelect;

function buildC100(invoice: InvoiceRow, runningNumber: number): string {
  const subsection = SUBSECTION_CODES[invoice.documentType] ?? '305';
  const fields = [
    padRight('C100', 4),
    padLeft(subsection, 3),
    padLeft(String(runningNumber), 9),
    padRight(invoice.documentNumber ?? '', 20),
    formatDate(invoice.invoiceDate),
    formatDate(invoice.invoiceDate),
    'S',
    padRight(invoice.customerName ?? '', 50),
    padRight(invoice.customerAddress ?? '', 50),
    padRight('', 30),
    padRight('IL', 2),
    padLeft(invoice.customerTaxId ?? '', 9),
    '1',
    padRight(invoice.currency ?? 'ILS', 3),
    formatAmount(invoice.totalExclVatMinorUnits),
    formatAmount(invoice.vatMinorUnits),
    formatAmount(invoice.totalInclVatMinorUnits),
    formatAmount(0),
    padRight(invoice.allocationNumber ?? '', 9),
    padRight('', 20),
  ];
  return fields.join('|');
}

function buildD110(item: InvoiceItemRow, subsection: string, runningNumber: number): string {
  const discountPct = Number(item.discountPercent);
  const gross = Number(item.quantity) * item.unitPriceMinorUnits;
  const discountAmount = Math.round((gross * discountPct) / 100);

  const fields = [
    padRight('D110', 4),
    padLeft(subsection, 3),
    padLeft(String(runningNumber), 9),
    padLeft(String(item.position), 4),
    padRight(item.catalogNumber ?? '', 20),
    padRight(item.description, 50),
    padRight('יחידה', 10),
    formatQuantity(item.quantity),
    formatAmount(item.unitPriceMinorUnits),
    formatDiscountPercent(item.discountPercent),
    formatAmount(discountAmount),
    formatAmount(item.lineTotalMinorUnits),
    formatVatRate(item.vatRateBasisPoints),
    formatAmount(item.vatAmountMinorUnits),
  ];
  return fields.join('|');
}

function buildD120(payment: InvoicePaymentRow, subsection: string, runningNumber: number): string {
  const methodCode = PAYMENT_METHOD_CODES[payment.method] ?? '5';
  const fields = [
    padRight('D120', 4),
    padLeft(subsection, 3),
    padLeft(String(runningNumber), 9),
    padLeft(methodCode, 2),
    padLeft('0', 3),
    padLeft('0', 4),
    padRight('', 12),
    padRight(payment.reference ?? '', 15),
    formatDate(payment.paidAt),
    formatAmount(payment.amountMinorUnits),
  ];
  return fields.join('|');
}

function buildZ900(recordType: string, count: number): string {
  return ['Z900', padRight(recordType, 4), padLeft(String(count), 9)].join('|');
}

// ── INI.TXT builder ──

type BusinessCounts = { c100: number; d110: number; d120: number };
type BusinessRow = typeof businesses.$inferSelect;

function buildIniContent(business: BusinessRow, year: number, counts: BusinessCounts): string {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  const lines = [
    `1000|${business.registrationNumber}`,
    `1001|${business.name}`,
    `1002|${business.streetAddress ?? ''}`,
    `1003|${business.city ?? ''}`,
    `1004|${year}0101`,
    `1005|${year}1231`,
    `1006|`,
    `1007|BON`,
    `1008|1.0`,
    `1009|${timestamp}`,
    `1010|${counts.c100}`,
    `1011|${counts.d110}`,
    `1012|${counts.d120}`,
  ];
  return lines.join('\r\n') + '\r\n';
}

// ── README.TXT builder ──

function buildReadmeContent(business: BusinessRow, year: number, counts: BusinessCounts): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('he-IL');
  const timeStr = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

  const lines = [
    'קובץ במבנה אחיד',
    '================',
    '',
    `שם העסק: ${business.name}`,
    `ח.פ./ע.מ.: ${business.registrationNumber}`,
    `שנת מס: ${year}`,
    '',
    'סיכום רשומות:',
    `  C100 (כותרות מסמכים): ${counts.c100}`,
    `  D110 (פרטי שורות): ${counts.d110}`,
    `  D120 (פרטי קבלות): ${counts.d120}`,
    '',
    `הופק על ידי: BON v1.0`,
    `תאריך הפקה: ${dateStr} ${timeStr}`,
  ];
  return lines.join('\r\n') + '\r\n';
}

// ── Main export function ──

export interface BkmvExportResult {
  iniContent: string;
  bkmvdataContent: string;
  readmeContent: string;
  filename: string;
}

export async function generateBkmvExport(
  businessId: string,
  year: number,
  txOrDb: DbOrTx = db
): Promise<BkmvExportResult> {
  const [business] = await txOrDb.select().from(businesses).where(eq(businesses.id, businessId));

  if (!business) throw notFound({ message: 'Business not found' });

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;

  const invoiceRecords = await txOrDb
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.businessId, businessId),
        inArray(invoices.status, [...FINALIZED_STATUSES]),
        gte(invoices.invoiceDate, yearStart),
        lt(invoices.invoiceDate, yearEnd)
      )
    )
    .orderBy(invoices.invoiceDate, invoices.sequenceNumber);

  if (invoiceRecords.length === 0) {
    throw badRequest({
      code: 'no_data',
      message: 'No finalized invoices found for the requested year',
    });
  }

  const invoiceIds = invoiceRecords.map((inv) => inv.id);

  const itemRecords = await txOrDb
    .select()
    .from(invoiceItems)
    .where(inArray(invoiceItems.invoiceId, invoiceIds));

  const paymentRecords = await txOrDb
    .select()
    .from(invoicePayments)
    .where(inArray(invoicePayments.invoiceId, invoiceIds));

  const itemsByInvoice = new Map<string, InvoiceItemRow[]>();
  for (const item of itemRecords) {
    const existing = itemsByInvoice.get(item.invoiceId) ?? [];
    existing.push(item);
    itemsByInvoice.set(item.invoiceId, existing);
  }

  const paymentsByInvoice = new Map<string, InvoicePaymentRow[]>();
  for (const payment of paymentRecords) {
    const existing = paymentsByInvoice.get(payment.invoiceId) ?? [];
    existing.push(payment);
    paymentsByInvoice.set(payment.invoiceId, existing);
  }

  const bkmvLines: string[] = [];
  let c100Count = 0;
  let d110Count = 0;
  let d120Count = 0;

  for (const invoice of invoiceRecords) {
    c100Count++;
    const runningNumber = c100Count;
    const subsection = SUBSECTION_CODES[invoice.documentType] ?? '305';

    bkmvLines.push(buildC100(invoice, runningNumber));

    const items = (itemsByInvoice.get(invoice.id) ?? []).sort((a, b) => a.position - b.position);
    for (const item of items) {
      d110Count++;
      bkmvLines.push(buildD110(item, subsection, runningNumber));
    }

    const payments = paymentsByInvoice.get(invoice.id) ?? [];
    for (const payment of payments) {
      d120Count++;
      bkmvLines.push(buildD120(payment, subsection, runningNumber));
    }
  }

  bkmvLines.push(buildZ900('C100', c100Count));
  bkmvLines.push(buildZ900('D110', d110Count));
  bkmvLines.push(buildZ900('D120', d120Count));

  const counts: BusinessCounts = { c100: c100Count, d110: d110Count, d120: d120Count };

  return {
    iniContent: buildIniContent(business, year, counts),
    bkmvdataContent: bkmvLines.join('\r\n') + '\r\n',
    readmeContent: buildReadmeContent(business, year, counts),
    filename: `BKMV_${business.registrationNumber}_${year}.zip`,
  };
}
