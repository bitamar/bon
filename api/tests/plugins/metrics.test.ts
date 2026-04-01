import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

function parseHealthCount(metricsBody: string): number {
  const line = metricsBody
    .split('\n')
    .find(
      (l: string) =>
        l.startsWith('http_requests_total') &&
        l.includes('route="/health"') &&
        l.includes('status_code="200"')
    );
  return line ? Number(line.split(' ').pop()) : 0;
}

describe('metrics plugin', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    delete process.env.METRICS_SECRET;
    vi.resetModules();
    const { buildServer } = await import('../../src/app.js');
    app = await buildServer({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  // ── helpers ──

  async function getMetrics(): Promise<string> {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    return res.body;
  }

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
    const baseline = parseHealthCount(await getMetrics());

    await app.inject({ method: 'GET', url: '/health' });
    await app.inject({ method: 'GET', url: '/health' });

    const after = parseHealthCount(await getMetrics());
    expect(after - baseline).toBe(2);
  });

  it('tracks error responses in http_errors_total', async () => {
    await app.inject({ method: 'GET', url: '/me' });

    const body = await getMetrics();
    expect(body).toContain('http_errors_total');
  });

  it('decorates app with metricsRegistry', () => {
    expect(app.metricsRegistry).toBeDefined();
    expect(typeof app.metricsRegistry.metrics).toBe('function');
  });
});

describe('metrics plugin with METRICS_SECRET', () => {
  let app: FastifyInstance;
  const secret = 'test-secret-at-least-16-chars';

  beforeEach(async () => {
    vi.stubEnv('METRICS_SECRET', secret);
    vi.resetModules();
    const { buildServer } = await import('../../src/app.js');
    app = await buildServer({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await app.close();
  });

  // ── helpers ──

  async function fetchMetrics(token?: string) {
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    return app.inject({ method: 'GET', url: '/metrics', headers });
  }

  it('returns 401 without auth', async () => {
    const res = await fetchMetrics();
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with wrong token', async () => {
    const res = await fetchMetrics('wrong-token');
    expect(res.statusCode).toBe(401);
  });

  it('returns metrics with correct token', async () => {
    const res = await fetchMetrics(secret);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('http_requests_total');
  });
});
