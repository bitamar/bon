import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/app.js';

// Override only what's needed for this file (rate limit), everything else comes from global setup
vi.mock('../src/env.js', async () => {
  const actual = await vi.importActual<typeof import('../src/env.js')>('../src/env.js');
  return {
    env: {
      ...actual.env,
      RATE_LIMIT_MAX: 2,
      RATE_LIMIT_TIME_WINDOW: 1000,
    },
  };
});

describe('app', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildServer({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it('enforces rate limits across requests', async () => {
    const first = await app.inject({ method: 'GET', url: '/me' });
    const second = await app.inject({ method: 'GET', url: '/me' });
    const third = await app.inject({ method: 'GET', url: '/me' });

    expect(first.statusCode).not.toBe(429);
    expect(second.statusCode).not.toBe(429);
    const body = third.json();
    expect(third.statusCode).toBe(429);
    expect(body).toMatchObject({
      error: 'too_many_requests',
      max: 2,
    });
    expect(body).toHaveProperty('reset');
    expect(body).toHaveProperty('requestId');
  });

  it('health check is excluded from rate limiting', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
    }
  });

  it('resets rate limit after the configured window', async () => {
    await app.inject({ method: 'GET', url: '/me' });
    await app.inject({ method: 'GET', url: '/me' });
    await app.inject({ method: 'GET', url: '/me' });

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).not.toBe(429);
  });
});
