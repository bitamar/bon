import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { businesses } from '../db/schema.js';
import type { DbOrTx } from '../db/types.js';

export type BusinessRecord = (typeof businesses)['$inferSelect'];
export type BusinessInsert = (typeof businesses)['$inferInsert'];

export async function insertBusiness(data: BusinessInsert, txOrDb: DbOrTx = db) {
  const rows = await txOrDb.insert(businesses).values(data).returning();
  return rows[0] ?? null;
}

export async function findBusinessById(businessId: string, txOrDb: DbOrTx = db) {
  const rows = await txOrDb.select().from(businesses).where(eq(businesses.id, businessId));
  return rows[0] ?? null;
}

export async function updateBusiness(
  businessId: string,
  updates: Partial<BusinessInsert>,
  txOrDb: DbOrTx = db
) {
  const rows = await txOrDb
    .update(businesses)
    .set(updates)
    .where(eq(businesses.id, businessId))
    .returning();
  return rows[0] ?? null;
}
