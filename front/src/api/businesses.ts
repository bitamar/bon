import { fetchJson } from '../lib/http';
import {
  businessListResponseSchema,
  businessResponseSchema,
  createBusinessBodySchema,
  teamListResponseSchema,
  updateBusinessBodySchema,
  type BusinessListResponse,
  type BusinessResponse,
  type CreateBusinessBody,
  type TeamListResponse,
  type UpdateBusinessBody,
} from '@bon/types/businesses';

export async function fetchBusinesses(): Promise<BusinessListResponse> {
  const json = await fetchJson<unknown>('/businesses');
  return businessListResponseSchema.parse(json);
}

export async function fetchBusiness(businessId: string): Promise<BusinessResponse> {
  const json = await fetchJson<unknown>(`/businesses/${businessId}`);
  return businessResponseSchema.parse(json);
}

export async function createBusiness(data: CreateBusinessBody): Promise<BusinessResponse> {
  const payload = createBusinessBodySchema.parse(data);
  const json = await fetchJson<unknown>('/businesses', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return businessResponseSchema.parse(json);
}

export async function updateBusiness(
  businessId: string,
  data: UpdateBusinessBody
): Promise<BusinessResponse> {
  const payload = updateBusinessBodySchema.parse(data);
  const json = await fetchJson<unknown>(`/businesses/${businessId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return businessResponseSchema.parse(json);
}

export async function fetchTeamMembers(businessId: string): Promise<TeamListResponse> {
  const json = await fetchJson<unknown>(`/businesses/${businessId}/team`);
  return teamListResponseSchema.parse(json);
}

export async function removeTeamMember(businessId: string, userId: string): Promise<void> {
  await fetchJson(`/businesses/${businessId}/team/${userId}`, {
    method: 'DELETE',
  });
}
