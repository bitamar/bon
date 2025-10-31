import { afterEach, describe, expect, it, vi } from 'vitest';

const DEFAULT_BASE_URL = 'http://localhost';

afterEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', DEFAULT_BASE_URL);
});

describe('config', () => {
  it('exports API base url when environment variable is set', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_API_BASE_URL', 'http://example.test');

    const { API_BASE_URL } = await import('../config');
    expect(API_BASE_URL).toBe('http://example.test');
  });

  it('throws descriptive error when environment variable is missing', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_API_BASE_URL', '');

    await expect(import('../config')).rejects.toThrow('Missing VITE_API_BASE_URL');
  });
});
