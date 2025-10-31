import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, HttpError } from '../../lib/http';

const fetchMock = vi.fn();
const originalFetch = global.fetch;

describe('fetchJson', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(() => {
    fetchMock.mockReset();
  });

  it('performs request with default options and parses response', async () => {
    const responseJson = { data: 42 };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValueOnce(responseJson),
    });

    const result = await fetchJson('/items', {
      method: 'POST',
      body: JSON.stringify({ foo: 'bar' }),
      headers: { 'X-Test': 'yes' },
    });

    const expectedUrl = `${import.meta.env.VITE_API_BASE_URL}/items`;

    expect(fetchMock).toHaveBeenCalledWith(expectedUrl, {
      credentials: 'include',
      headers: {
        'X-Test': 'yes',
      },
      method: 'POST',
      body: JSON.stringify({ foo: 'bar' }),
    });
    expect(result).toEqual(responseJson);
  });

  it('throws HttpError with parsed body when request fails', async () => {
    const errorBody = { message: 'Not Found' };
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValueOnce(errorBody),
    });

    const expectedError: Partial<HttpError> = {
      status: 404,
      message: 'Not Found',
      body: errorBody,
    };

    await expect(fetchJson('/missing')).rejects.toMatchObject(expectedError);
  });

  it('throws HttpError with fallback message when body not json', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValueOnce(new Error('bad json')),
    });

    const expectedError: Partial<HttpError> = {
      status: 500,
      message: 'Request failed: 500',
      body: undefined,
    };

    await expect(fetchJson('/broken')).rejects.toMatchObject(expectedError);
  });
});
