import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('../src/routes/auth.js', () => ({
  // noop auth routes to avoid OIDC discovery during these tests
  authRoutes: async () => {},
}));

describe('app genReqId behavior', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildServer } = await import('../src/app.js');
    app = await buildServer({ logger: false });
    app.get('/_echo_id', async (req) => ({ id: req.id }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('uses x-request-id header when provided as string', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/_echo_id',
      headers: { 'x-request-id': 'req-123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: 'req-123' });
  });

  it('uses first value when x-request-id contains multiple values', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/_echo_id',
      headers: { 'x-request-id': 'first, second' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: 'first' });
  });

  it('generates a UUID when header missing or empty', async () => {
    const res = await app.inject({ method: 'GET', url: '/_echo_id' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string };
    expect(typeof body.id).toBe('string');
    expect(body.id.length).toBeGreaterThan(0);
  });
});
