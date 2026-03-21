import { performance } from 'node:perf_hooks';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { pool } from '../db/client.js';
import { env } from '../env.js';

type CheckStatus = 'up' | 'down';

interface CheckResult {
  status: CheckStatus;
  latencyMs?: number;
  error?: string;
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, CheckResult>;
  uptimeSeconds: number;
}

const startTime = Date.now();

const healthPluginFn: FastifyPluginAsync = async (app) => {
  async function checkDatabase(): Promise<CheckResult> {
    const start = performance.now();
    try {
      await pool.query('SELECT 1');
      return { status: 'up', latencyMs: Math.round(performance.now() - start) };
    } catch (err: unknown) {
      app.log.error(err, 'health check: database unreachable');
      return {
        status: 'down',
        latencyMs: Math.round(performance.now() - start),
        error: 'unavailable',
      };
    }
  }

  async function checkPdfService(): Promise<CheckResult> {
    const start = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${env.PDF_SERVICE_URL}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      const latencyMs = Math.round(performance.now() - start);
      return res.ok ? { status: 'up', latencyMs } : { status: 'down', latencyMs };
    } catch (err: unknown) {
      app.log.error(err, 'health check: PDF service unreachable');
      return {
        status: 'down',
        latencyMs: Math.round(performance.now() - start),
        error: 'unavailable',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  app.get('/health/ready', async (_request, reply) => {
    const [database, pdfService] = await Promise.all([checkDatabase(), checkPdfService()]);

    const pgBoss: CheckResult = { status: app.boss ? 'up' : 'down' };

    const checks: Record<string, CheckResult> = { database, pgBoss, pdfService };

    const critical = database.status === 'down';
    const degraded = !critical && (pgBoss.status === 'down' || pdfService.status === 'down');

    let status: HealthResponse['status'] = 'healthy';
    if (critical) status = 'unhealthy';
    else if (degraded) status = 'degraded';

    const body: HealthResponse = {
      status,
      checks,
      uptimeSeconds: Math.round((Date.now() - startTime) / 1000),
    };

    const statusCode = status === 'unhealthy' ? 503 : 200;
    return reply.status(statusCode).send(body);
  });
};

export const healthPlugin = fp(healthPluginFn, { name: 'health-plugin' });
