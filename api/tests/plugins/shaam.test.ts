import { describe, it, expect, vi, afterEach } from 'vitest';

describe('shaam plugin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function loadPluginWithMode(mode: 'mock' | 'sandbox' | 'production') {
    vi.doMock('../../src/env.js', () => ({
      env: { SHAAM_MODE: mode },
    }));

    const { ShaamMockClient } = await import('../../src/services/shaam/mock-client.js');
    const { ShaamHttpClient } = await import('../../src/services/shaam/http-client.js');
    const { shaamPlugin } = await import('../../src/plugins/shaam.js');

    // Minimal Fastify mock
    const decoratedService = { value: null as unknown };
    const app = {
      decorate: vi.fn((name: string, service: unknown) => {
        if (name === 'shaamService') decoratedService.value = service;
      }),
      log: { info: vi.fn(), warn: vi.fn() },
      boss: null,
    };

    await (shaamPlugin as unknown as (app: unknown) => Promise<void>)(app);
    return { app, decoratedService, ShaamMockClient, ShaamHttpClient };
  }

  it('creates ShaamMockClient in mock mode', async () => {
    const { decoratedService, ShaamMockClient } = await loadPluginWithMode('mock');
    expect(decoratedService.value).toBeInstanceOf(ShaamMockClient);
  });

  it('creates ShaamHttpClient in sandbox mode', async () => {
    const { decoratedService, ShaamHttpClient } = await loadPluginWithMode('sandbox');
    expect(decoratedService.value).toBeInstanceOf(ShaamHttpClient);
  });

  it('creates ShaamHttpClient in production mode', async () => {
    const { decoratedService, ShaamHttpClient } = await loadPluginWithMode('production');
    expect(decoratedService.value).toBeInstanceOf(ShaamHttpClient);
  });
});
