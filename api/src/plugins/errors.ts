import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { type AppError, normalizeError, notFound } from '../lib/app-error.js';
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

    if (exposeToClient) {
      request.log.debug(logFields, 'request_failed');
    } else {
      request.log.error(logFields, 'request_failed');
    }

    const body = buildErrorBody(normalized, exposeToClient, request.id);
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

function buildErrorBody(
  normalized: AppError,
  exposeToClient: boolean,
  requestId: string
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    error: normalized.code,
    requestId,
  };

  if (!exposeToClient) return body;

  if (normalized.message) body['message'] = normalized.message;
  if (normalized.details != null) body['details'] = normalized.details;

  if (normalized.extras) {
    for (const [key, value] of Object.entries(normalized.extras)) {
      if (value != null) body[key] = value;
    }
  }

  applyRateLimitFields(body, normalized.details);
  return body;
}

function applyRateLimitFields(body: Record<string, unknown>, details: unknown): void {
  if (!isRecord(details)) return;

  if (body['max'] == null && typeof details['max'] === 'number') {
    body['max'] = details['max'];
  }

  if (body['reset'] != null) return;

  if (typeof details['reset'] === 'number') {
    body['reset'] = details['reset'];
  } else if (typeof details['ttl'] === 'number') {
    body['reset'] = details['ttl'];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null;
}
