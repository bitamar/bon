import { performance } from 'node:perf_hooks';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import client from 'prom-client';
import { env } from '../env.js';

declare module 'fastify' {
  interface FastifyInstance {
    metricsRegistry: client.Registry;
  }
}

const requestStartTimes = new WeakMap<FastifyRequest, number>();

const metricsPluginFn: FastifyPluginAsync = async (app) => {
  const register = new client.Registry();
  client.collectDefaultMetrics({ register });

  // ── HTTP metrics ──

  const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [register],
  });

  const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [register],
  });

  const httpRequestsInFlight = new client.Gauge({
    name: 'http_requests_in_flight',
    help: 'Number of HTTP requests currently being processed',
    registers: [register],
  });

  const httpErrorsTotal = new client.Counter({
    name: 'http_errors_total',
    help: 'Total number of HTTP error responses (4xx and 5xx)',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [register],
  });

  app.decorate('metricsRegistry', register);

  // ── Hooks ──

  app.addHook('onRequest', async (request) => {
    httpRequestsInFlight.inc();
    requestStartTimes.set(request, performance.now());
  });

  app.addHook('onResponse', async (request, reply) => {
    httpRequestsInFlight.dec();
    const start = requestStartTimes.get(request);
    if (start != null) {
      requestStartTimes.delete(request);
    }

    const route = request.routeOptions?.url ?? request.url;
    const method = request.method;
    const statusCode = String(reply.statusCode);
    const durationSec = typeof start === 'number' ? (performance.now() - start) / 1000 : undefined;

    httpRequestsTotal.inc({ method, route, status_code: statusCode });
    if (durationSec != null) {
      httpRequestDuration.observe({ method, route, status_code: statusCode }, durationSec);
    }
    if (reply.statusCode >= 400) {
      httpErrorsTotal.inc({ method, route, status_code: statusCode });
    }
  });

  // ── /metrics endpoint ──

  app.get('/metrics', async (request, reply) => {
    if (env.METRICS_SECRET) {
      const auth = request.headers.authorization;
      if (auth !== `Bearer ${env.METRICS_SECRET}`) {
        return reply.status(401).send({ error: 'unauthorized' });
      }
    }
    const metrics = await register.metrics();
    return reply.type(register.contentType).send(metrics);
  });
};

export const metricsPlugin = fp(metricsPluginFn, { name: 'metrics-plugin' });
