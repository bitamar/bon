import { fetchJson } from '../lib/http';
import {
  emergencyNumbersResponseSchema,
  type AddEmergencyNumbersBody,
  type EmergencyNumbersResponse,
} from '@bon/types/shaam';
import { okResponseSchema } from '@bon/types/common';

export async function fetchEmergencyNumbers(businessId: string): Promise<EmergencyNumbersResponse> {
  const json = await fetchJson<unknown>(`/businesses/${businessId}/emergency-numbers`);
  return emergencyNumbersResponseSchema.parse(json);
}

export async function addEmergencyNumbers(
  businessId: string,
  data: AddEmergencyNumbersBody
): Promise<EmergencyNumbersResponse> {
  const json = await fetchJson<unknown>(`/businesses/${businessId}/emergency-numbers`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return emergencyNumbersResponseSchema.parse(json);
}

export async function deleteEmergencyNumber(businessId: string, id: string): Promise<{ ok: true }> {
  const json = await fetchJson<unknown>(`/businesses/${businessId}/emergency-numbers/${id}`, {
    method: 'DELETE',
  });
  return okResponseSchema.parse(json);
}
