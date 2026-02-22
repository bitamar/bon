import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { db } from '../db/client.js';
import { invoiceItems, invoices } from '../db/schema.js';
import type * as schema from '../db/schema.js';

type DbOrTx = NodePgDatabase<typeof schema>;

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
