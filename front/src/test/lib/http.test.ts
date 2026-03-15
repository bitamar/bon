import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, fetchBlob, HttpError } from '../../lib/http';

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

describe('fetchJson', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
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

describe('fetchBlob', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterAll(() => {
    fetchMock.mockReset();
  });

  it('returns response on success', async () => {
    const mockResponse = { ok: true, status: 200 };
    fetchMock.mockResolvedValueOnce(mockResponse);

    const result = await fetchBlob('/files/invoice.pdf');

    const expectedUrl = `${import.meta.env.VITE_API_BASE_URL}/files/invoice.pdf`;
    expect(fetchMock).toHaveBeenCalledWith(expectedUrl, { credentials: 'include' });
    expect(result).toBe(mockResponse);
  });

  it('throws HttpError with parsed body on failure', async () => {
    const errorBody = { error: 'Internal Server Error' };
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValueOnce(errorBody),
    });

    const expectedError: Partial<HttpError> = {
      status: 500,
      message: 'Internal Server Error',
      body: errorBody,
    };

    await expect(fetchBlob('/files/invoice.pdf')).rejects.toMatchObject(expectedError);
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

    await expect(fetchBlob('/files/broken')).rejects.toMatchObject(expectedError);
  });
});
