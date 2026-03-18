import { desc, eq, and, gte, inArray, lt, sum, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { invoicePayments, invoices } from '../db/schema.js';
import type { DbOrTx } from '../db/types.js';

export type PaymentRecord = (typeof invoicePayments)['$inferSelect'];
export type PaymentInsert = (typeof invoicePayments)['$inferInsert'];

export async function insertPayment(data: PaymentInsert, txOrDb: DbOrTx = db) {
  const rows = await txOrDb.insert(invoicePayments).values(data).returning();
  return rows[0]!;
}

export async function findPaymentById(paymentId: string, invoiceId: string, txOrDb: DbOrTx = db) {
  const rows = await txOrDb
    .select()
    .from(invoicePayments)
    .where(and(eq(invoicePayments.id, paymentId), eq(invoicePayments.invoiceId, invoiceId)));
  return rows[0] ?? null;
}

export async function findPaymentsByInvoiceId(invoiceId: string, txOrDb: DbOrTx = db) {
  return txOrDb
    .select()
    .from(invoicePayments)
    .where(eq(invoicePayments.invoiceId, invoiceId))
    .orderBy(
      desc(invoicePayments.paidAt),
      desc(invoicePayments.createdAt),
      desc(invoicePayments.id)
    );
}

export async function findPaymentsByInvoiceIds(invoiceIds: string[], txOrDb: DbOrTx = db) {
  if (invoiceIds.length === 0) return [];
  return txOrDb
    .select()
    .from(invoicePayments)
    .where(inArray(invoicePayments.invoiceId, invoiceIds))
    .orderBy(invoicePayments.invoiceId, desc(invoicePayments.paidAt));
}

export async function deletePaymentById(paymentId: string, invoiceId: string, txOrDb: DbOrTx = db) {
  const rows = await txOrDb
    .delete(invoicePayments)
    .where(and(eq(invoicePayments.id, paymentId), eq(invoicePayments.invoiceId, invoiceId)))
    .returning();
  return rows[0] ?? null;
}

export async function sumPaymentsByInvoiceId(invoiceId: string, txOrDb: DbOrTx = db) {
  const rows = await txOrDb
    .select({ total: sql<number>`COALESCE(${sum(invoicePayments.amountMinorUnits)}, 0)` })
    .from(invoicePayments)
    .where(eq(invoicePayments.invoiceId, invoiceId));
  return Number(rows[0]?.total ?? 0);
}

/**
 * Sum payments for a business within a date range (paidAt is a date column).
 * JOINs through invoices to scope by businessId.
 */
export async function sumPaymentsForPeriod(
  businessId: string,
  dateFrom: string,
  dateTo: string,
  txOrDb: DbOrTx = db
): Promise<number> {
  const rows = await txOrDb
    .select({
      total: sql<string>`COALESCE(${sum(invoicePayments.amountMinorUnits)}, 0)`,
    })
    .from(invoicePayments)
    .innerJoin(invoices, eq(invoicePayments.invoiceId, invoices.id))
    .where(
      and(
        eq(invoices.businessId, businessId),
        gte(invoicePayments.paidAt, dateFrom),
        lt(invoicePayments.paidAt, dateTo)
      )
    );
  return Number(rows[0]?.total ?? 0);
}
