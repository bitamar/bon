import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { normalizeError, notFound } from '../lib/app-error.js';
import { env } from '../env.js';

const errorsPluginFn: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, request, reply) => {
    const normalized = normalizeError(error);
    const isProduction = env.NODE_ENV === 'production';
    const isServerError = normalized.statusCode >= 500;
    const exposeToClient = normalized.expose && (!isServerError || !isProduction);

    const logFields: { err: unknown; requestId: string; userId?: string } = {
      err: error,
      requestId: request.id,
    };
    if (request.user) {
      logFields.userId = request.user.id;
    }

    if (!exposeToClient) {
      request.log.error(logFields, 'request_failed');
    } else {
      request.log.debug(logFields, 'request_failed');
    }

    const body: Record<string, unknown> = {
      error: normalized.code,
      requestId: request.id,
    };

    if (exposeToClient && normalized.message) {
      body['message'] = normalized.message;
    }

    if (exposeToClient && normalized.details !== undefined) {
      body['details'] = normalized.details;
    }

    if (exposeToClient && normalized.extras) {
      for (const [key, value] of Object.entries(normalized.extras)) {
        if (value !== undefined) body[key] = value;
      }
    }

    if (exposeToClient) {
      if (
        body['max'] === undefined &&
        isRecord(normalized.details) &&
        typeof normalized.details['max'] === 'number'
      ) {
        body['max'] = normalized.details['max'];
      }
      if (body['reset'] === undefined && isRecord(normalized.details)) {
        const fromDetails =
          typeof normalized.details['reset'] === 'number'
            ? normalized.details['reset']
            : typeof normalized.details['ttl'] === 'number'
              ? normalized.details['ttl']
              : undefined;
        if (fromDetails !== undefined) body['reset'] = fromDetails;
      }
    }

    return reply.status(normalized.statusCode).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    const error = notFound({
      message: 'Not Found',
      details: { method: request.method, url: request.url },
    });

    const body: Record<string, unknown> = {
      error: error.code,
      message: error.message,
      requestId: request.id,
      details: error.details,
    };

    return reply.status(error.statusCode).send(body);
  });
};

export const errorPlugin = fp(errorsPluginFn, {
  name: 'error-plugin',
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
