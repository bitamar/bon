import { afterAll, afterEach, beforeEach, vi } from 'vitest';

/**
 * Sets up a shared fetch mock with lifecycle hooks and helpers.
 * Call at the top level of a `describe` block.
 */
export function useFetchMock() {
  const fetchMock = vi.fn();
  const originalFetch = globalThis.fetch;

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

  function mockOk(body: unknown, status = 200) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status,
      json: vi.fn().mockResolvedValueOnce(body),
    });
  }

  function mockFail(status: number) {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status,
      json: vi.fn().mockResolvedValueOnce({ message: 'error' }),
    });
  }

  return { fetchMock, mockOk, mockFail };
}
