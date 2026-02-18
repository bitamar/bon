import { fetchJson } from '../lib/http';
import {
  createInvitationBodySchema,
  invitationListResponseSchema,
  myInvitationsResponseSchema,
  type CreateInvitationBody,
  type InvitationListResponse,
  type MyInvitationsResponse,
} from '@bon/types/invitations';

export async function createInvitation(
  businessId: string,
  data: CreateInvitationBody
): Promise<void> {
  const payload = createInvitationBodySchema.parse(data);
  await fetchJson(`/businesses/${businessId}/invitations`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchInvitations(businessId: string): Promise<InvitationListResponse> {
  const json = await fetchJson<unknown>(`/businesses/${businessId}/invitations`);
  return invitationListResponseSchema.parse(json);
}

export async function fetchMyInvitations(): Promise<MyInvitationsResponse> {
  const json = await fetchJson<unknown>('/invitations/mine');
  return myInvitationsResponseSchema.parse(json);
}

export async function acceptInvitation(token: string): Promise<void> {
  await fetchJson(`/invitations/${token}/accept`, {
    method: 'POST',
  });
}

export async function declineInvitation(token: string): Promise<void> {
  await fetchJson(`/invitations/${token}/decline`, {
    method: 'POST',
  });
}
