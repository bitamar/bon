import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { shaamAuditLog } from '../db/schema.js';
import type { DbOrTx } from '../db/types.js';

export type ShaamAuditLogRecord = (typeof shaamAuditLog)['$inferSelect'];
export type ShaamAuditLogInsert = (typeof shaamAuditLog)['$inferInsert'];

export async function insertShaamAuditLog(data: ShaamAuditLogInsert, txOrDb: DbOrTx = db) {
  const rows = await txOrDb.insert(shaamAuditLog).values(data).returning();
  return rows[0] ?? null;
}

export async function findShaamAuditLogsByInvoiceId(invoiceId: string, txOrDb: DbOrTx = db) {
  return txOrDb
    .select()
    .from(shaamAuditLog)
    .where(eq(shaamAuditLog.invoiceId, invoiceId))
    .orderBy(shaamAuditLog.createdAt);
}
