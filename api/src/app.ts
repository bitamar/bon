import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import formbody from '@fastify/formbody';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { env } from './env.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { businessRoutes } from './routes/businesses.js';
import { invitationRoutes } from './routes/invitations.js';
import { customerRoutes } from './routes/customers.js';
import { invoiceRoutes } from './routes/invoices.js';
import { authPlugin } from './plugins/auth.js';
import { businessContextPlugin } from './plugins/business-context.js';
import { errorPlugin } from './plugins/errors.js';
import { loggingPlugin } from './plugins/logging.js';
import { createLogger } from './lib/logger.js';
import { isHostAllowed, parseOriginHeader } from './lib/origin.js';

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

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(businessRoutes);
  await app.register(invitationRoutes);
  await app.register(customerRoutes);
  await app.register(invoiceRoutes);
  app.get('/health', async () => ({ ok: true }));

  return app;
}
