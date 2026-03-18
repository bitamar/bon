import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
  sum,
} from 'drizzle-orm';
import { db } from '../db/client.js';
import { invoiceItems, invoices } from '../db/schema.js';
import type { DbOrTx } from '../db/types.js';
import { escapeLikePattern } from '../lib/query-utils.js';

export type InvoiceRecord = (typeof invoices)['$inferSelect'];
export type InvoiceInsert = (typeof invoices)['$inferInsert'];
export type InvoiceItemRecord = (typeof invoiceItems)['$inferSelect'];
export type InvoiceItemInsert = (typeof invoiceItems)['$inferInsert'];

export async function insertInvoice(data: InvoiceInsert, txOrDb: DbOrTx = db) {
  const rows = await txOrDb.insert(invoices).values(data).returning();
  return rows[0] ?? null;
}

export async function findInvoiceById(invoiceId: string, businessId: string, txOrDb: DbOrTx = db) {
  const rows = await txOrDb
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, businessId)));
  return rows[0] ?? null;
}

export async function findInvoiceByIdForUpdate(invoiceId: string, businessId: string, tx: DbOrTx) {
  const rows = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, businessId)))
    .for('update');
  return rows[0] ?? null;
}

export async function updateInvoice(
  invoiceId: string,
  businessId: string,
  updates: Partial<InvoiceInsert>,
  txOrDb: DbOrTx = db
) {
  const rows = await txOrDb
    .update(invoices)
    .set(updates)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, businessId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteInvoice(invoiceId: string, businessId: string, txOrDb: DbOrTx = db) {
  const rows = await txOrDb
    .delete(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, businessId)))
    .returning();
  return rows[0] ?? null;
}

export async function insertItems(data: InvoiceItemInsert[], txOrDb: DbOrTx = db) {
  if (data.length === 0) return [];
  return txOrDb.insert(invoiceItems).values(data).returning();
}

export async function deleteItemsByInvoiceId(invoiceId: string, txOrDb: DbOrTx = db) {
  return txOrDb.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
}

export async function findItemsByInvoiceId(invoiceId: string, txOrDb: DbOrTx = db) {
  return txOrDb
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId))
    .orderBy(invoiceItems.position);
}

export async function findCreditNotesBySourceInvoiceId(
  sourceInvoiceId: string,
  businessId: string,
  txOrDb: DbOrTx = db
) {
  return txOrDb
    .select({
      id: invoices.id,
      documentNumber: invoices.documentNumber,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.creditedInvoiceId, sourceInvoiceId),
        eq(invoices.businessId, businessId),
        eq(invoices.documentType, 'credit_note')
      )
    );
}

// ── list / count ──

export interface InvoiceListFilters {
  businessId: string;
  status?: InvoiceRecord['status'][];
  customerId?: string;
  documentType?: InvoiceRecord['documentType'];
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  isOverdue?: boolean;
  sort: string;
  offset: number;
  limit: number;
}

function buildListConditions(filters: InvoiceListFilters, { skipStatus = false } = {}) {
  const conditions = [eq(invoices.businessId, filters.businessId)];

  if (!skipStatus && filters.status && filters.status.length > 0) {
    conditions.push(inArray(invoices.status, filters.status));
  }
  if (filters.customerId) {
    conditions.push(eq(invoices.customerId, filters.customerId));
  }
  if (filters.documentType) {
    conditions.push(eq(invoices.documentType, filters.documentType));
  }
  if (filters.dateFrom) {
    conditions.push(gte(invoices.invoiceDate, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(invoices.invoiceDate, filters.dateTo));
  }
  if (filters.isOverdue !== undefined) {
    conditions.push(eq(invoices.isOverdue, filters.isOverdue));
  }
  if (filters.q) {
    const pattern = `%${escapeLikePattern(filters.q)}%`;
    const textSearch = or(
      ilike(invoices.documentNumber, pattern),
      ilike(invoices.customerName, pattern)
    );
    if (textSearch) conditions.push(textSearch);
  }

  return conditions;
}

const SORT_MAP: Record<string, ReturnType<typeof asc>> = {
  'invoiceDate:asc': asc(invoices.invoiceDate),
  'invoiceDate:desc': desc(invoices.invoiceDate),
  'totalInclVatMinorUnits:asc': asc(invoices.totalInclVatMinorUnits),
  'totalInclVatMinorUnits:desc': desc(invoices.totalInclVatMinorUnits),
  'createdAt:desc': desc(invoices.createdAt),
};

export async function findInvoices(filters: InvoiceListFilters, txOrDb: DbOrTx = db) {
  const conditions = buildListConditions(filters);
  const isDueDateSort = filters.sort.startsWith('dueDate:');

  let query = txOrDb
    .select({
      id: invoices.id,
      businessId: invoices.businessId,
      customerId: invoices.customerId,
      customerName: invoices.customerName,
      documentType: invoices.documentType,
      status: invoices.status,
      isOverdue: invoices.isOverdue,
      sequenceGroup: invoices.sequenceGroup,
      documentNumber: invoices.documentNumber,
      invoiceDate: invoices.invoiceDate,
      dueDate: invoices.dueDate,
      totalInclVatMinorUnits: invoices.totalInclVatMinorUnits,
      currency: invoices.currency,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(and(...conditions))
    .$dynamic();

  if (isDueDateSort) {
    const nullsLast = sql`CASE WHEN ${invoices.dueDate} IS NULL THEN 1 ELSE 0 END`;
    const direction =
      filters.sort === 'dueDate:asc' ? asc(invoices.dueDate) : desc(invoices.dueDate);
    query = query.orderBy(nullsLast, direction);
  } else {
    const sortExpr = SORT_MAP[filters.sort];
    if (sortExpr) {
      query = query.orderBy(sortExpr);
    }
  }

  return query.offset(filters.offset).limit(filters.limit);
}

export async function countInvoices(filters: InvoiceListFilters, txOrDb: DbOrTx = db) {
  const conditions = buildListConditions(filters);
  const rows = await txOrDb
    .select({ value: count() })
    .from(invoices)
    .where(and(...conditions));
  return rows[0]?.value ?? 0;
}

// ── aggregates ──

export interface AggregateResult {
  total: number;
  count: number;
}

export const OUTSTANDING_STATUSES: InvoiceRecord['status'][] = [
  'finalized',
  'sent',
  'partially_paid',
];

/**
 * Sum + count for outstanding invoices (finalized, sent, partially_paid).
 * Ignores the status filter chip but respects all other filters.
 */
export async function aggregateOutstanding(
  filters: InvoiceListFilters,
  txOrDb: DbOrTx = db
): Promise<AggregateResult> {
  const conditions = buildListConditions(filters, { skipStatus: true });
  conditions.push(inArray(invoices.status, OUTSTANDING_STATUSES));

  const rows = await txOrDb
    .select({
      total: sum(invoices.totalInclVatMinorUnits),
      count: count(),
    })
    .from(invoices)
    .where(and(...conditions));

  return {
    total: Number(rows[0]?.total ?? 0),
    count: rows[0]?.count ?? 0,
  };
}

/**
 * Sum of totalInclVatMinorUnits for the entire filtered set (respects all filters including status).
 */
export async function aggregateFiltered(
  filters: InvoiceListFilters,
  txOrDb: DbOrTx = db
): Promise<number> {
  const conditions = buildListConditions(filters);
  const rows = await txOrDb
    .select({
      total: sum(invoices.totalInclVatMinorUnits),
    })
    .from(invoices)
    .where(and(...conditions));

  return Number(rows[0]?.total ?? 0);
}

const REVENUE_STATUSES: InvoiceRecord['status'][] = [
  'finalized',
  'sent',
  'paid',
  'partially_paid',
  'credited',
];

export async function aggregateRevenue(
  businessId: string,
  dateFrom: string,
  dateTo: string,
  txOrDb: DbOrTx = db
): Promise<AggregateResult> {
  const rows = await txOrDb
    .select({
      total: sum(invoices.totalInclVatMinorUnits),
      count: count(),
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.businessId, businessId),
        inArray(invoices.status, REVENUE_STATUSES),
        gte(invoices.invoiceDate, dateFrom),
        lte(invoices.invoiceDate, dateTo)
      )
    );

  return {
    total: Number(rows[0]?.total ?? 0),
    count: rows[0]?.count ?? 0,
  };
}

export async function aggregateOverdue(
  businessId: string,
  txOrDb: DbOrTx = db
): Promise<AggregateResult> {
  const rows = await txOrDb
    .select({
      total: sum(invoices.totalInclVatMinorUnits),
      count: count(),
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.businessId, businessId),
        eq(invoices.isOverdue, true),
        inArray(invoices.status, OUTSTANDING_STATUSES)
      )
    );

  return {
    total: Number(rows[0]?.total ?? 0),
    count: rows[0]?.count ?? 0,
  };
}

export interface ShaamStatusResult {
  pending: number;
  rejected: number;
}

export async function aggregateShaamStatus(
  businessId: string,
  txOrDb: DbOrTx = db
): Promise<ShaamStatusResult> {
  const rows = await txOrDb
    .select({
      status: invoices.allocationStatus,
      count: count(),
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.businessId, businessId),
        inArray(invoices.allocationStatus, ['pending', 'rejected'])
      )
    )
    .groupBy(invoices.allocationStatus);

  let pending = 0;
  let rejected = 0;
  for (const row of rows) {
    if (row.status === 'pending') pending = row.count;
    if (row.status === 'rejected') rejected = row.count;
  }

  return { pending, rejected };
}

// ── PCN874 report ──

const REPORT_STATUSES = REVENUE_STATUSES;

export async function findInvoicesForReport(
  businessId: string,
  dateFrom: string,
  dateTo: string,
  txOrDb: DbOrTx = db
): Promise<InvoiceRecord[]> {
  return txOrDb
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.businessId, businessId),
        inArray(invoices.status, REPORT_STATUSES),
        gte(invoices.invoiceDate, dateFrom),
        lte(invoices.invoiceDate, dateTo)
      )
    )
    .orderBy(asc(invoices.invoiceDate), asc(invoices.sequenceNumber));
}

// ── overdue digest ──

export interface OverdueInvoiceRow {
  id: string;
  businessId: string;
  documentNumber: string | null;
  customerName: string | null;
  totalInclVatMinorUnits: number;
  dueDate: string; // always non-null — query filters with isNotNull
}

export async function findOverdueInvoices(txOrDb: DbOrTx = db): Promise<OverdueInvoiceRow[]> {
  const rows = await txOrDb
    .select({
      id: invoices.id,
      businessId: invoices.businessId,
      documentNumber: invoices.documentNumber,
      customerName: invoices.customerName,
      totalInclVatMinorUnits: invoices.totalInclVatMinorUnits,
      dueDate: invoices.dueDate,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.isOverdue, true),
        inArray(invoices.status, OUTSTANDING_STATUSES),
        isNotNull(invoices.dueDate)
      )
    );
  return rows as OverdueInvoiceRow[];
}
