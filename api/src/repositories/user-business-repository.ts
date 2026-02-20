import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { businesses, userBusinesses, users } from '../db/schema.js';

export type UserBusinessRecord = (typeof userBusinesses)['$inferSelect'];
export type UserBusinessInsert = (typeof userBusinesses)['$inferInsert'];

export async function findUserBusiness(userId: string, businessId: string) {
  const rows = await db
    .select()
    .from(userBusinesses)
    .where(
      and(
        eq(userBusinesses.userId, userId),
        eq(userBusinesses.businessId, businessId),
        isNull(userBusinesses.removedAt)
      )
    );
  return rows[0] ?? null;
}

export async function insertUserBusiness(data: UserBusinessInsert) {
  const rows = await db.insert(userBusinesses).values(data).returning();
  return rows[0] ?? null;
}

/**
 * Inserts a user-business membership, or reactivates an existing soft-deleted one.
 * Used when a previously removed user accepts a new invitation.
 */
export async function upsertUserBusiness(data: UserBusinessInsert) {
  const rows = await db
    .insert(userBusinesses)
    .values(data)
    .onConflictDoUpdate({
      target: [userBusinesses.userId, userBusinesses.businessId],
      set: {
        role: data.role,
        invitedByUserId: data.invitedByUserId ?? null,
        invitedAt: data.invitedAt ?? null,
        acceptedAt: data.acceptedAt ?? null,
        removedAt: null,
      },
    })
    .returning();
  return rows[0] ?? null;
}

export async function deleteUserBusiness(userId: string, businessId: string) {
  await db
    .update(userBusinesses)
    .set({ removedAt: new Date() })
    .where(and(eq(userBusinesses.userId, userId), eq(userBusinesses.businessId, businessId)));
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
    .where(
      and(
        eq(userBusinesses.userId, userId),
        isNull(userBusinesses.removedAt),
        eq(businesses.isActive, true)
      )
    );
  return rows;
}

export async function findTeamMembers(businessId: string) {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      role: userBusinesses.role,
      joinedAt: userBusinesses.createdAt,
    })
    .from(userBusinesses)
    .innerJoin(users, eq(userBusinesses.userId, users.id))
    .where(and(eq(userBusinesses.businessId, businessId), isNull(userBusinesses.removedAt)));
  return rows;
}
