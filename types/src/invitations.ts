import { z } from 'zod';
import { isoDateTime, nonEmptyString, nullableString, uuidSchema } from './common.js';
import { businessRoleSchema } from './businesses.js';

export const invitationStatusSchema = z.enum(['pending', 'accepted', 'declined', 'expired']);

export const invitationSchema = z.object({
  id: uuidSchema,
  businessId: uuidSchema,
  email: z.string().trim().email(),
  role: businessRoleSchema,
  status: invitationStatusSchema,
  invitedByUserId: uuidSchema,
  token: z.string(),
  personalMessage: nullableString,
  expiresAt: isoDateTime,
  acceptedAt: z.union([isoDateTime, z.literal(null)]),
  declinedAt: z.union([isoDateTime, z.literal(null)]),
  createdAt: isoDateTime,
});

export const createInvitationBodySchema = z
  .object({
    email: z.string().trim().email(),
    role: z.enum(['admin', 'user']),
    personalMessage: nonEmptyString.optional(),
  })
  .strict();

export const invitationTokenParamSchema = z.object({
  token: z.string().trim().min(1),
});

export const invitationResponseSchema = z.object({
  id: uuidSchema,
  businessId: uuidSchema,
  businessName: nonEmptyString,
  email: z.string().trim().email(),
  role: businessRoleSchema,
  status: invitationStatusSchema,
  invitedByName: nullableString,
  personalMessage: nullableString,
  expiresAt: isoDateTime,
  createdAt: isoDateTime,
});

export const invitationListResponseSchema = z.object({
  invitations: z.array(invitationResponseSchema),
});

export const myInvitationItemSchema = z.object({
  id: uuidSchema,
  businessId: uuidSchema,
  businessName: nonEmptyString,
  role: businessRoleSchema,
  invitedByName: nullableString,
  personalMessage: nullableString,
  expiresAt: isoDateTime,
  token: z.string(),
  createdAt: isoDateTime,
});

export const myInvitationsResponseSchema = z.object({
  invitations: z.array(myInvitationItemSchema),
});

export type InvitationStatus = z.infer<typeof invitationStatusSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type CreateInvitationBody = z.infer<typeof createInvitationBodySchema>;
export type InvitationTokenParam = z.infer<typeof invitationTokenParamSchema>;
export type InvitationResponse = z.infer<typeof invitationResponseSchema>;
export type InvitationListResponse = z.infer<typeof invitationListResponseSchema>;
export type MyInvitationItem = z.infer<typeof myInvitationItemSchema>;
export type MyInvitationsResponse = z.infer<typeof myInvitationsResponseSchema>;
