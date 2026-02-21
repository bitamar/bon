import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getGoogleLoginUrl, getMe, getSettings, logout, updateSettings } from '../../auth/api';
import { fetchJson } from '../../lib/http';

vi.mock('../../lib/http', () => ({
  fetchJson: vi.fn(),
}));

const fetchJsonMock = vi.mocked(fetchJson);

const settingsResponse = {
  user: {
    id: '55555555-5555-4555-8555-555555555555',
    email: 'user@example.com',
    name: 'Sample User',
    avatarUrl: null,
    phone: null,
  },
};

describe('auth api', () => {
  beforeEach(() => {
    fetchJsonMock.mockReset();
  });

  it('getMe returns current user when request succeeds', async () => {
    const controller = new AbortController();
    fetchJsonMock.mockResolvedValueOnce(settingsResponse);

    const result = await getMe({ signal: controller.signal });

    expect(fetchJsonMock).toHaveBeenCalledWith('/me', { signal: controller.signal });
    expect(result).toEqual(settingsResponse);
  });

  it('getMe returns null when request fails', async () => {
    fetchJsonMock.mockRejectedValueOnce(new Error('boom'));

    const result = await getMe();

    expect(fetchJsonMock).toHaveBeenCalledWith('/me', undefined);
    expect(result).toBeNull();
  });

  it('logout posts to logout endpoint', async () => {
    fetchJsonMock.mockResolvedValueOnce(undefined);

    await logout();

    expect(fetchJsonMock).toHaveBeenCalledWith('/auth/logout', { method: 'POST' });
  });

  it('getGoogleLoginUrl builds URL from API base', () => {
    const expectedUrl = `${import.meta.env.VITE_API_BASE_URL}/auth/google`;
    expect(getGoogleLoginUrl()).toBe(expectedUrl);
  });

  it('getSettings returns user settings', async () => {
    const controller = new AbortController();
    fetchJsonMock.mockResolvedValueOnce(settingsResponse);

    const result = await getSettings({ signal: controller.signal });

    expect(fetchJsonMock).toHaveBeenCalledWith('/settings', { signal: controller.signal });
    expect(result).toEqual(settingsResponse);
  });

  it('updateSettings validates payload and returns updated settings', async () => {
    const payload = { phone: '0501234567', name: 'New Name' };
    const updated = { user: { ...settingsResponse.user, name: 'New Name', phone: '0501234567' } };
    fetchJsonMock.mockResolvedValueOnce(updated);

    const result = await updateSettings(payload);

    expect(fetchJsonMock).toHaveBeenCalled();
    const call = fetchJsonMock.mock.calls[0];
    if (!call) throw new Error('Expected fetchJson to be called with arguments');
    const [, init] = call;
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse((init?.body as string) ?? '')).toEqual(payload);
    expect(result).toEqual(updated);
  });
});
