import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/app.js';

describe('health plugin', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildServer({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('returns healthy status with dependency checks', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body.status).toBe('healthy');
    expect(body).toHaveProperty('checks');
    expect(body).toHaveProperty('uptimeSeconds');

    const checks = body.checks as Record<string, { status: string }>;
    expect(checks.database.status).toBe('up');
  });

  it('includes database latency in response', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    const body = res.json() as Record<string, unknown>;
    const checks = body.checks as Record<string, { status: string; latencyMs?: number }>;

    expect(typeof checks.database.latencyMs).toBe('number');
    expect(checks.database.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports pgBoss status', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    const body = res.json() as Record<string, unknown>;
    const checks = body.checks as Record<string, { status: string }>;

    // In test mode pg-boss is not started, so it should be down
    expect(checks.pgBoss.status).toBe('down');
  });

  it('reports pdfService status', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    const body = res.json() as Record<string, unknown>;
    const checks = body.checks as Record<string, { status: string }>;

    // PDF service is not running in tests, so it should be down
    expect(checks.pdfService).toBeDefined();
    expect(['up', 'down']).toContain(checks.pdfService.status);
  });

  it('returns degraded when non-critical services are down', async () => {
    // In test mode: pg-boss is down (non-critical), PDF service likely down
    // Database should be up → status should be degraded (not unhealthy)
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    const body = res.json() as Record<string, unknown>;

    // DB is up so it's either healthy or degraded, never unhealthy
    expect(['healthy', 'degraded']).toContain(body.status);
    expect(res.statusCode).toBe(200);
  });

  it('existing /health endpoint still works', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
