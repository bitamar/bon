import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  insertInvitation,
  findInvitationByToken,
  findInvitationsByBusinessId,
  findPendingInvitationsByEmail,
  updateInvitationStatus,
  findAnyInvitationByBusinessAndEmail,
  resetInvitationToPending,
} from '../repositories/invitation-repository.js';
import { upsertUserBusiness, findUserBusiness } from '../repositories/user-business-repository.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/app-error.js';
import { invitationListResponseSchema, myInvitationsResponseSchema } from '@bon/types/invitations';

export type InvitationListResponse = z.infer<typeof invitationListResponseSchema>;
export type MyInvitationsResponse = z.infer<typeof myInvitationsResponseSchema>;

export type CreateInvitationInput = {
  email: string;
  role: 'admin' | 'user';
  personalMessage?: string | undefined;
};

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export async function createInvitation(
  businessId: string,
  invitedByUserId: string,
  input: CreateInvitationInput
) {
  const existing = await findAnyInvitationByBusinessAndEmail(businessId, input.email);

  if (existing) {
    if (existing.status === 'pending') {
      throw conflict({ code: 'invitation_already_exists' });
    }
    // Declined or expired — reset to pending so they can be re-invited
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await resetInvitationToPending(existing.id, token, expiresAt);
    return;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const token = generateToken();

  const invitation = await insertInvitation({
    businessId,
    email: input.email,
    role: input.role,
    invitedByUserId,
    token,
    personalMessage: input.personalMessage ?? null,
    expiresAt,
    createdAt: now,
  });

  if (!invitation) throw new Error('Failed to create invitation');
}

export async function listInvitations(businessId: string) {
  const invitations = await findInvitationsByBusinessId(businessId);

  return {
    invitations: invitations.map((inv) => ({
      id: inv.id,
      businessId: inv.businessId,
      businessName: inv.businessName,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      invitedByName: inv.invitedByName ?? null,
      personalMessage: inv.personalMessage ?? null,
      expiresAt: inv.expiresAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
    })),
  } satisfies InvitationListResponse;
}

export async function getMyInvitations(email: string) {
  const invitations = await findPendingInvitationsByEmail(email);

  return {
    invitations: invitations.map((inv) => ({
      id: inv.id,
      businessId: inv.businessId,
      businessName: inv.businessName,
      role: inv.role,
      invitedByName: inv.invitedByName ?? null,
      personalMessage: inv.personalMessage ?? null,
      expiresAt: inv.expiresAt.toISOString(),
      token: inv.token,
      createdAt: inv.createdAt.toISOString(),
    })),
  } satisfies MyInvitationsResponse;
}

export async function acceptInvitation(token: string, userId: string, userEmail: string) {
  const invitation = await findInvitationByToken(token);

  if (!invitation) {
    throw notFound({ code: 'invitation_not_found' });
  }

  if (invitation.status !== 'pending') {
    throw badRequest({ code: 'invitation_not_pending' });
  }

  if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
    throw forbidden({ code: 'email_mismatch' });
  }

  const now = new Date();
  if (invitation.expiresAt < now) {
    await updateInvitationStatus(invitation.id, 'expired', now);
    throw badRequest({ code: 'invitation_expired' });
  }

  const existingMember = await findUserBusiness(userId, invitation.businessId);
  if (existingMember) {
    throw conflict({ code: 'already_member' });
  }

  // upsertUserBusiness handles the case where the user was previously removed (soft-deleted)
  await upsertUserBusiness({
    userId,
    businessId: invitation.businessId,
    role: invitation.role,
    invitedByUserId: invitation.invitedByUserId,
    invitedAt: invitation.createdAt,
    acceptedAt: now,
    createdAt: now,
  });

  await updateInvitationStatus(invitation.id, 'accepted', now);
}

export async function declineInvitation(token: string, userId: string, userEmail: string) {
  const invitation = await findInvitationByToken(token);

  if (!invitation) {
    throw notFound({ code: 'invitation_not_found' });
  }

  if (invitation.status !== 'pending') {
    throw badRequest({ code: 'invitation_not_pending' });
  }

  if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
    throw forbidden({ code: 'email_mismatch' });
  }

  const now = new Date();
  await updateInvitationStatus(invitation.id, 'declined', now);
}
