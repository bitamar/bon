import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/app.js';

interface CheckResult {
  status: string;
  latencyMs?: number;
}

interface HealthBody {
  status: string;
  checks: Record<string, CheckResult>;
  uptimeSeconds: number;
}

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

  // ── helpers ──

  async function getHealthReady(): Promise<{ statusCode: number; body: HealthBody }> {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    return { statusCode: res.statusCode, body: res.json() as HealthBody };
  }

  it('returns healthy status with dependency checks', async () => {
    const { statusCode, body } = await getHealthReady();

    expect(statusCode).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body).toHaveProperty('checks');
    expect(body).toHaveProperty('uptimeSeconds');
    expect(body.checks.database.status).toBe('up');
  });

  it('includes database latency in response', async () => {
    const { body } = await getHealthReady();

    expect(typeof body.checks.database.latencyMs).toBe('number');
    expect(body.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports pgBoss as down in test mode', async () => {
    const { body } = await getHealthReady();
    expect(body.checks.pgBoss.status).toBe('down');
  });

  it('reports pdfService status', async () => {
    const { body } = await getHealthReady();
    expect(body.checks.pdfService).toBeDefined();
    expect(['up', 'down']).toContain(body.checks.pdfService.status);
  });

  it('returns 200 when database is up (healthy or degraded)', async () => {
    const { statusCode, body } = await getHealthReady();
    expect(['healthy', 'degraded']).toContain(body.status);
    expect(statusCode).toBe(200);
  });

  it('existing /health endpoint still works', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
