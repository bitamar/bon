import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { businessInvitations, businesses, users } from '../db/schema.js';

export type InvitationRecord = (typeof businessInvitations)['$inferSelect'];
export type InvitationInsert = (typeof businessInvitations)['$inferInsert'];

export async function insertInvitation(data: InvitationInsert) {
  const rows = await db.insert(businessInvitations).values(data).returning();
  return rows[0] ?? null;
}

export async function findInvitationByToken(token: string) {
  const rows = await db
    .select()
    .from(businessInvitations)
    .where(eq(businessInvitations.token, token));
  return rows[0] ?? null;
}

export async function findInvitationsByBusinessId(businessId: string) {
  const rows = await db
    .select({
      id: businessInvitations.id,
      businessId: businessInvitations.businessId,
      businessName: businesses.name,
      email: businessInvitations.email,
      role: businessInvitations.role,
      status: businessInvitations.status,
      invitedByName: users.name,
      personalMessage: businessInvitations.personalMessage,
      expiresAt: businessInvitations.expiresAt,
      createdAt: businessInvitations.createdAt,
    })
    .from(businessInvitations)
    .innerJoin(businesses, eq(businessInvitations.businessId, businesses.id))
    .innerJoin(users, eq(businessInvitations.invitedByUserId, users.id))
    .where(eq(businessInvitations.businessId, businessId));
  return rows;
}

export async function findPendingInvitationsByEmail(email: string) {
  const rows = await db
    .select({
      id: businessInvitations.id,
      businessId: businessInvitations.businessId,
      businessName: businesses.name,
      role: businessInvitations.role,
      invitedByName: users.name,
      personalMessage: businessInvitations.personalMessage,
      expiresAt: businessInvitations.expiresAt,
      token: businessInvitations.token,
      createdAt: businessInvitations.createdAt,
    })
    .from(businessInvitations)
    .innerJoin(businesses, eq(businessInvitations.businessId, businesses.id))
    .innerJoin(users, eq(businessInvitations.invitedByUserId, users.id))
    .where(and(eq(businessInvitations.email, email), eq(businessInvitations.status, 'pending')));
  return rows;
}

export async function updateInvitationStatus(
  invitationId: string,
  status: 'accepted' | 'declined' | 'expired',
  timestamp: Date
) {
  const updates: Partial<InvitationInsert> = { status };
  if (status === 'accepted') {
    updates.acceptedAt = timestamp;
  } else if (status === 'declined') {
    updates.declinedAt = timestamp;
  }

  const rows = await db
    .update(businessInvitations)
    .set(updates)
    .where(eq(businessInvitations.id, invitationId))
    .returning();
  return rows[0] ?? null;
}

/** Returns any invitation for this business+email regardless of status. */
export async function findAnyInvitationByBusinessAndEmail(businessId: string, email: string) {
  const rows = await db
    .select()
    .from(businessInvitations)
    .where(
      and(eq(businessInvitations.businessId, businessId), eq(businessInvitations.email, email))
    );
  return rows[0] ?? null;
}

/** Resets a declined or expired invitation back to pending with a new token and expiry. */
export async function resetInvitationToPending(
  invitationId: string,
  token: string,
  expiresAt: Date
) {
  await db
    .update(businessInvitations)
    .set({ status: 'pending', token, expiresAt, acceptedAt: null, declinedAt: null })
    .where(eq(businessInvitations.id, invitationId));
}

export async function findExistingInvitation(businessId: string, email: string) {
  const rows = await db
    .select()
    .from(businessInvitations)
    .where(
      and(
        eq(businessInvitations.businessId, businessId),
        eq(businessInvitations.email, email),
        eq(businessInvitations.status, 'pending')
      )
    );
  return rows[0] ?? null;
}
