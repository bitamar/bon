import { desc, eq, and, sum, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { invoicePayments } from '../db/schema.js';
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
    .orderBy(desc(invoicePayments.paidAt), desc(invoicePayments.createdAt));
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
