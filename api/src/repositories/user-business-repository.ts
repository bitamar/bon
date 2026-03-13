import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { businesses, userBusinesses, users } from '../db/schema.js';

export type UserBusinessRecord = (typeof userBusinesses)['$inferSelect'];
export type UserBusinessInsert = (typeof userBusinesses)['$inferInsert'];

export async function findUserBusiness(userId: string, businessId: string) {
  const rows = await db
    .select()
    .from(userBusinesses)
    .where(and(eq(userBusinesses.userId, userId), eq(userBusinesses.businessId, businessId)));
  return rows[0] ?? null;
}

export async function insertUserBusiness(data: UserBusinessInsert) {
  const rows = await db.insert(userBusinesses).values(data).returning();
  return rows[0] ?? null;
}

export async function findBusinessesForUser(userId: string) {
  const rows = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      businessType: businesses.businessType,
      registrationNumber: businesses.registrationNumber,
      isActive: businesses.isActive,
      role: userBusinesses.role,
    })
    .from(userBusinesses)
    .innerJoin(businesses, eq(userBusinesses.businessId, businesses.id))
    .where(and(eq(userBusinesses.userId, userId), eq(businesses.isActive, true)));
  return rows;
}

export async function findBusinessOwnerEmails(businessId: string) {
  const rows = await db
    .select({
      email: users.email,
      name: users.name,
    })
    .from(userBusinesses)
    .innerJoin(users, eq(userBusinesses.userId, users.id))
    .where(and(eq(userBusinesses.businessId, businessId), eq(userBusinesses.role, 'owner')));
  return rows;
}
