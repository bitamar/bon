import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/app.js';

describe('metrics plugin', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildServer({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('exposes /metrics endpoint with prometheus format', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain('http_requests_total');
    expect(res.body).toContain('http_request_duration_seconds');
    expect(res.body).toContain('http_requests_in_flight');
    expect(res.body).toContain('process_cpu_seconds_total');
  });

  it('increments http_requests_total on each request', async () => {
    await app.inject({ method: 'GET', url: '/health' });
    await app.inject({ method: 'GET', url: '/health' });

    const res = await app.inject({ method: 'GET', url: '/metrics' });
    const lines = res.body.split('\n');
    const healthLine = lines.find(
      (l: string) =>
        l.startsWith('http_requests_total') &&
        l.includes('route="/health"') &&
        l.includes('status_code="200"')
    );

    expect(healthLine).toBeDefined();
    const count = Number(healthLine!.split(' ').pop());
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('tracks error responses in http_errors_total', async () => {
    // /me returns 401 when not authenticated
    await app.inject({ method: 'GET', url: '/me' });

    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.body).toContain('http_errors_total');
  });

  it('decorates app with metricsRegistry', () => {
    expect(app.metricsRegistry).toBeDefined();
    expect(typeof app.metricsRegistry.metrics).toBe('function');
  });
});

describe('metrics plugin with METRICS_SECRET', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.stubEnv('METRICS_SECRET', 'test-secret-at-least-16-chars');
    // Re-import env to pick up the stubbed value
    vi.resetModules();
    const { buildServer: build } = await import('../../src/app.js');
    app = await build({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await app.close();
  });

  it('returns 401 when METRICS_SECRET is set and no auth provided', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when bearer token is wrong', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: 'Bearer wrong-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns metrics when correct bearer token provided', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: 'Bearer test-secret-at-least-16-chars' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('http_requests_total');
  });
});
