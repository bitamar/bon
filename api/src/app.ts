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
import { authPlugin } from './plugins/auth.js';
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
        const requestIdHeader = request.headers['x-request-id'];
        if (typeof requestIdHeader === 'string' && requestIdHeader.length > 0) {
          const first = requestIdHeader.split(',')[0]?.trim();
          if (first && first.length > 0) return first;
        }
        if (Array.isArray(requestIdHeader) && requestIdHeader.length > 0) {
          const [first] = requestIdHeader;
          if (typeof first === 'string' && first.length > 0) return first;
        }
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
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
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
  await app.register(errorPlugin);

  await app.register(authRoutes);
  await app.register(userRoutes);
  app.get('/health', async () => ({ ok: true }));

  return app;
}
