import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import formbody from '@fastify/formbody';
import fastifySwagger from '@fastify/swagger';
import scalarApiReference from '@scalar/fastify-api-reference';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { env } from './env.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { businessRoutes } from './routes/businesses.js';
import { customerRoutes } from './routes/customers.js';
import { invoiceRoutes } from './routes/invoices.js';
import { emergencyNumberRoutes } from './routes/emergency-numbers.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { pcn874Routes } from './routes/pcn874.js';
import { subscriptionRoutes } from './routes/subscriptions.js';
import { reportRoutes } from './routes/reports.js';
import { authPlugin } from './plugins/auth.js';
import { businessContextPlugin } from './plugins/business-context.js';
import { errorPlugin } from './plugins/errors.js';
import { loggingPlugin } from './plugins/logging.js';
import { shaamPlugin } from './plugins/shaam.js';
import { maintenanceJobsPlugin } from './plugins/maintenance-jobs.js';
import { jobsPlugin } from './plugins/jobs.js';
import { createLogger } from './lib/logger.js';
import { isHostAllowed, parseOriginHeader } from './lib/origin.js';
import { createShaamAllocationHandler } from './jobs/handlers/shaam-allocation.js';
import { runJob } from './jobs/boss.js';

export async function buildServer(options: FastifyServerOptions = {}) {
  const { logger: providedLogger, genReqId, ...rest } = options;
  const logger = providedLogger ?? createLogger();
  const app = Fastify({
    ...rest,
    logger,
    genReqId:
      genReqId ??
      ((request) => {
        const header = request.headers['x-request-id'];
        const raw = Array.isArray(header) ? header[0] : header?.split(',')[0];
        const requestId = raw?.trim();
        if (requestId?.length) return requestId;
        return randomUUID();
      }),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, false);
      const parsed = parseOriginHeader(origin);
      if (!parsed) return cb(null, false);
      return cb(null, isHostAllowed(parsed.host, env.APP_ORIGIN_HOST));
    },
    credentials: true,
    methods: ['GET', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    exposedHeaders: ['Set-Cookie'],
    preflight: true,
    preflightContinue: false,
  });
  await app.register(cookie, { secret: env.JWT_SECRET });
  await app.register(formbody);
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'BON API',
        description: 'Israeli invoicing platform API',
        version: '1.0.0',
      },
      tags: [
        { name: 'Auth', description: 'Authentication and sessions' },
        { name: 'Users', description: 'User settings' },
        { name: 'Businesses', description: 'Business management' },
        { name: 'Customers', description: 'Customer management' },
        { name: 'Invoices', description: 'Invoice lifecycle' },
        { name: 'Dashboard', description: 'Business dashboard aggregates' },
        { name: 'Reports', description: 'Business reports and exports' },
        { name: 'Subscriptions', description: 'Subscription & payment management' },
      ],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(scalarApiReference, {
    routePrefix: '/docs',
  });
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_TIME_WINDOW,
    allowList: (req) => req.url === '/health',
    errorResponseBuilder: (request, context) => ({
      statusCode: 429,
      error: 'too_many_requests',
      max: context.max,
      reset: context.ttl,
      requestId: request.id,
    }),
  });
  await app.register(loggingPlugin);
  await app.register(authPlugin);
  await app.register(businessContextPlugin);
  await app.register(errorPlugin);
  await app.register(jobsPlugin);
  await app.register(shaamPlugin);
  await app.register(maintenanceJobsPlugin);

  // Register job handlers when pg-boss is available (skipped in test mode)
  if (app.boss) {
    await app.boss.createQueue('shaam-allocation-request');
    const handler = createShaamAllocationHandler(app.shaamService, app.log, app.boss);
    await app.boss.work(
      'shaam-allocation-request',
      { includeMetadata: true },
      runJob('shaam-allocation-request', handler, app.log)
    );

    // Register emergency report job handler
    await app.boss.createQueue('shaam-emergency-report');
    const { createShaamEmergencyReportHandler } =
      await import('./jobs/handlers/shaam-emergency-report.js');
    const emergencyHandler = createShaamEmergencyReportHandler(app.shaamService, app.log);
    await app.boss.work(
      'shaam-emergency-report',
      runJob('shaam-emergency-report', emergencyHandler, app.log)
    );
  }

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(businessRoutes);
  await app.register(customerRoutes);
  await app.register(invoiceRoutes);
  await app.register(emergencyNumberRoutes);
  await app.register(dashboardRoutes);
  await app.register(pcn874Routes);
  await app.register(subscriptionRoutes);
  await app.register(reportRoutes);
  app.get('/health', async () => ({ ok: true }));
  app.get('/', async (_request, reply) => reply.redirect('/docs'));

  return app;
}
