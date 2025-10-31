import { performance } from 'node:perf_hooks';
import type { FastifyBaseLogger, FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

type LoggerBindings = {
  requestId?: string;
  userId?: string;
  sessionId?: string;
  [key: string]: unknown;
};

function getBindings(logger: FastifyBaseLogger): LoggerBindings {
  const candidate = logger as FastifyBaseLogger & { bindings?: () => LoggerBindings };
  if (typeof candidate.bindings !== 'function') return {};
  try {
    return (candidate.bindings() ?? {}) as LoggerBindings;
  } catch {
    return {};
  }
}

const requestStartTimes = new WeakMap<FastifyRequest, number>();

const loggingPluginFn: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request) => {
    const bindings = getBindings(request.log);
    if (bindings.requestId !== request.id) {
      request.log = request.log.child({ requestId: request.id });
    }
    requestStartTimes.set(request, performance.now());
    request.log.debug(
      {
        method: request.method,
        url: request.url,
      },
      'request_started'
    );
  });

  app.addHook('preHandler', async (request) => {
    const user = request.user;
    if (!user) return;

    const bindings = getBindings(request.log);
    if (bindings.userId === user.id) return;

    request.log = request.log.child({
      userId: user.id,
      sessionId: request.sessionId,
    });
  });

  app.addHook('onResponse', async (request, reply) => {
    const start = requestStartTimes.get(request);
    const responseTime = typeof start === 'number' ? performance.now() - start : undefined;
    if (start !== undefined) {
      requestStartTimes.delete(request);
    }
    request.log.info(
      {
        statusCode: reply.statusCode,
        responseTime,
      },
      'request_completed'
    );
  });
};

export const loggingPlugin = fp(loggingPluginFn, { name: 'logging-plugin' });
