import { eq } from 'drizzle-orm';
import { businesses } from '../db/schema.js';

export type BusinessRecord = (typeof businesses)['$inferSelect'];
export type BusinessInsert = (typeof businesses)['$inferInsert'];

export { db } from '../db/client.js';

export async function insertBusinessTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  data: BusinessInsert
) {
  const rows = await tx.insert(businesses).values(data).returning();
  return rows[0] ?? null;
}

export async function findBusinessById(businessId: string) {
  const rows = await db.select().from(businesses).where(eq(businesses.id, businessId));
  return rows[0] ?? null;
}

export async function updateBusiness(businessId: string, updates: Partial<BusinessInsert>) {
  const rows = await db
    .update(businesses)
    .set(updates)
    .where(eq(businesses.id, businessId))
    .returning();
  return rows[0] ?? null;
}
