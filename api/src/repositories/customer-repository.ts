import { and, eq, ilike, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { customers } from '../db/schema.js';
import { escapeLikePattern } from '../lib/query-utils.js';
import type { DbOrTx } from '../db/types.js';

export type CustomerRecord = (typeof customers)['$inferSelect'];
export type CustomerInsert = (typeof customers)['$inferInsert'];

export async function insertCustomer(data: CustomerInsert, txOrDb: DbOrTx = db) {
  const rows = await txOrDb.insert(customers).values(data).returning();
  return rows[0] ?? null;
}

export async function findCustomerById(
  customerId: string,
  businessId: string,
  txOrDb: DbOrTx = db
) {
  const rows = await txOrDb
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.businessId, businessId)));
  return rows[0] ?? null;
}

export async function updateCustomer(
  customerId: string,
  businessId: string,
  updates: Partial<CustomerInsert>,
  txOrDb: DbOrTx = db
) {
  const rows = await txOrDb
    .update(customers)
    .set(updates)
    .where(and(eq(customers.id, customerId), eq(customers.businessId, businessId)))
    .returning();
  return rows[0] ?? null;
}

export async function findCustomerByTaxId(businessId: string, taxId: string, txOrDb: DbOrTx = db) {
  const rows = await txOrDb
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(
      and(
        eq(customers.businessId, businessId),
        eq(customers.taxId, taxId),
        eq(customers.isActive, true)
      )
    );
  return rows[0] ?? null;
}

export async function searchCustomers(
  businessId: string,
  query: string | undefined,
  activeOnly: boolean,
  limit: number,
  txOrDb: DbOrTx = db
) {
  const conditions = [eq(customers.businessId, businessId)];

  if (activeOnly) {
    conditions.push(eq(customers.isActive, true));
  }

  if (query) {
    const escaped = escapeLikePattern(query);
    const textSearch = or(
      ilike(customers.name, `%${escaped}%`),
      ilike(customers.taxId, `%${escaped}%`)
    );
    if (textSearch) conditions.push(textSearch);
  }

  return txOrDb
    .select({
      id: customers.id,
      name: customers.name,
      taxId: customers.taxId,
      taxIdType: customers.taxIdType,
      isLicensedDealer: customers.isLicensedDealer,
      city: customers.city,
      email: customers.email,
      streetAddress: customers.streetAddress,
      isActive: customers.isActive,
    })
    .from(customers)
    .where(and(...conditions))
    .orderBy(customers.name)
    .limit(limit);
}
