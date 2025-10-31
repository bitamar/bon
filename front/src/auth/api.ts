import { fetchJson } from '../lib/http';
import { API_BASE_URL } from '../config';
import { settingsResponseSchema, updateSettingsBodySchema } from '@bon/types/users';
import type { SettingsResponse, UpdateSettingsBody } from '@bon/types/users';

type RequestOptions = {
  signal?: AbortSignal;
};

export async function getMe(options: RequestOptions = {}): Promise<SettingsResponse | null> {
  try {
    const requestInit = options.signal ? { signal: options.signal } : undefined;
    const json = await fetchJson<unknown>('/me', requestInit);
    return settingsResponseSchema.parse(json);
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await fetchJson('/auth/logout', { method: 'POST' });
}

export function getGoogleLoginUrl(): string {
  return `${API_BASE_URL}/auth/google`;
}

export async function getSettings(options: RequestOptions = {}): Promise<SettingsResponse> {
  const requestInit = options.signal ? { signal: options.signal } : undefined;
  const json = await fetchJson<unknown>('/settings', requestInit);
  return settingsResponseSchema.parse(json);
}

export async function updateSettings(input: UpdateSettingsBody): Promise<SettingsResponse> {
  const payload = updateSettingsBodySchema.parse(input);
  const json = await fetchJson<unknown>('/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return settingsResponseSchema.parse(json);
}
