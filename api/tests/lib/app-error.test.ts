import { describe, expect, it } from 'vitest';
import {
  AppError,
  badRequest,
  conflict,
  normalizeError,
  notFound,
  unauthorized,
} from '../../src/lib/app-error.js';

describe('normalizeError', () => {
  it('returns the same AppError instance', () => {
    const err = new AppError({ statusCode: 409, code: 'conflict' });
    expect(normalizeError(err)).toBe(err);
  });

  it('maps Fastify errors to AppError, preserving 4xx details', () => {
    const fastifyError = {
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many',
      max: 99,
      ttl: 120,
    };

    const normalized = normalizeError(fastifyError);
    expect(normalized).toMatchObject({
      statusCode: 429,
      code: 'too_many_requests',
      message: 'Too many',
      expose: true,
      extras: { max: 99, reset: 120 },
    });
    expect(normalized).toBeInstanceOf(AppError);
  });

  it('hides details for server errors and wraps generic errors', () => {
    const err = new Error('boom');
    const normalized = normalizeError(err);
    expect(normalized).toMatchObject({
      statusCode: 500,
      code: 'internal_server_error',
      message: 'Internal Server Error',
      expose: false,
    });
  });
});

describe('factory helpers', () => {
  it('badRequest returns 400 error', () => {
    expect(badRequest({ code: 'invalid_body' })).toMatchObject({
      statusCode: 400,
      code: 'invalid_body',
    });
  });

  it('notFound returns 404 error', () => {
    expect(notFound()).toMatchObject({ statusCode: 404, code: 'not_found' });
  });

  it('unauthorized returns 401 error', () => {
    expect(unauthorized()).toMatchObject({ statusCode: 401, code: 'unauthorized' });
  });

  it('conflict returns 409 error', () => {
    expect(conflict({ code: 'duplicate' })).toMatchObject({
      statusCode: 409,
      code: 'duplicate',
    });
  });
});
