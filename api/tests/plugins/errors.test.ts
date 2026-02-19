import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { AppError } from '../../src/lib/app-error.js';

async function buildApp(envOverrides: Record<string, unknown>) {
  vi.resetModules();
  vi.doMock('../../src/env.js', () => ({
    env: {
      NODE_ENV: 'development',
      ...envOverrides,
    },
  }));
  const { errorPlugin } = await import('../../src/plugins/errors.js');
  const app = Fastify({ logger: { level: 'silent' } });
  await app.register(errorPlugin);
  return app;
}

// Like buildApp, but also returns AppError from the same module instance so that
// `instanceof AppError` checks inside errorPlugin work correctly after vi.resetModules().
async function buildAppWithFreshImports(envOverrides: Record<string, unknown>) {
  vi.resetModules();
  vi.doMock('../../src/env.js', () => ({
    env: {
      NODE_ENV: 'development',
      ...envOverrides,
    },
  }));
  const [{ errorPlugin }, { AppError: FreshAppError }] = await Promise.all([
    import('../../src/plugins/errors.js'),
    import('../../src/lib/app-error.js'),
  ]);
  const app = Fastify({ logger: { level: 'silent' } });
  await app.register(errorPlugin);
  return { app, AppError: FreshAppError };
}

describe('errorPlugin', () => {
  afterEach(async () => {
    vi.resetModules();
  });

  it('exposes client error details when not in production', async () => {
    const app = await buildApp({ NODE_ENV: 'development' });

    app.get('/429', async () => {
      throw new AppError({
        statusCode: 429,
        code: 'too_many_requests',
        message: 'Slow down',
        extras: { max: 10, reset: 30 },
      });
    });

    const res = await app.inject({ method: 'GET', url: '/429' });
    expect(res.statusCode).toBe(429);
    const body = res.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      error: 'too_many_requests',
      message: 'Slow down',
    });
    expect(body).toHaveProperty('requestId');

    await app.close();
  });

  it('hides server error details in production', async () => {
    const app = await buildApp({ NODE_ENV: 'production' });

    app.get('/500', async () => {
      throw new Error('secret');
    });

    const res = await app.inject({ method: 'GET', url: '/500' });
    expect(res.statusCode).toBe(500);
    const body = res.json() as Record<string, unknown>;
    expect(body).toEqual({
      error: 'internal_server_error',
      requestId: expect.any(String),
    });

    await app.close();
  });

  it('returns structured not found responses', async () => {
    const app = await buildApp({ NODE_ENV: 'development' });

    const res = await app.inject({ method: 'GET', url: '/missing' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      error: 'not_found',
      message: 'Not Found',
      details: { method: 'GET', url: '/missing' },
    });

    await app.close();
  });

  describe('applyRateLimitFields', () => {
    it('populates max and reset from details when present as numbers', async () => {
      const { app, AppError: FreshAppError } = await buildAppWithFreshImports({
        NODE_ENV: 'development',
      });

      app.get('/rate-limit-details', async () => {
        throw new FreshAppError({
          statusCode: 429,
          code: 'too_many_requests',
          message: 'Too many requests',
          details: { max: 10, reset: 30 },
        });
      });

      const res = await app.inject({ method: 'GET', url: '/rate-limit-details' });
      expect(res.statusCode).toBe(429);
      const body = res.json() as Record<string, unknown>;
      expect(body['max']).toBe(10);
      expect(body['reset']).toBe(30);

      await app.close();
    });

    it('populates reset from details.ttl when details.reset is absent', async () => {
      const { app, AppError: FreshAppError } = await buildAppWithFreshImports({
        NODE_ENV: 'development',
      });

      app.get('/rate-limit-ttl', async () => {
        throw new FreshAppError({
          statusCode: 429,
          code: 'too_many_requests',
          message: 'Too many requests',
          details: { max: 5, ttl: 60 },
        });
      });

      const res = await app.inject({ method: 'GET', url: '/rate-limit-ttl' });
      expect(res.statusCode).toBe(429);
      const body = res.json() as Record<string, unknown>;
      expect(body['max']).toBe(5);
      expect(body['reset']).toBe(60);

      await app.close();
    });

    it('does not overwrite reset when already set on body via extras', async () => {
      const { app, AppError: FreshAppError } = await buildAppWithFreshImports({
        NODE_ENV: 'development',
      });

      app.get('/rate-limit-extras-reset', async () => {
        throw new FreshAppError({
          statusCode: 429,
          code: 'too_many_requests',
          message: 'Too many requests',
          extras: { reset: 99 },
          details: { reset: 42 },
        });
      });

      const res = await app.inject({ method: 'GET', url: '/rate-limit-extras-reset' });
      expect(res.statusCode).toBe(429);
      const body = res.json() as Record<string, unknown>;
      // extras.reset (99) is written to body first; applyRateLimitFields should not overwrite it
      expect(body['reset']).toBe(99);

      await app.close();
    });
  });
});
