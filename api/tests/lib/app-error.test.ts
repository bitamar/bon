import { describe, expect, it } from 'vitest';
import {
  AppError,
  badRequest,
  conflict,
  extractConstraintName,
  forbidden,
  normalizeError,
  notFound,
  unauthorized,
  unprocessableEntity,
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

  it('forbidden returns 403 error', () => {
    expect(forbidden()).toMatchObject({ statusCode: 403, code: 'forbidden' });
  });

  it('unprocessableEntity returns 422 error', () => {
    expect(unprocessableEntity({ code: 'no_items' })).toMatchObject({
      statusCode: 422,
      code: 'no_items',
    });
  });
});

describe('normalizeError edge cases', () => {
  it('wraps a non-Error non-object as a generic AppError', () => {
    const normalized = normalizeError('just a string');
    expect(normalized).toBeInstanceOf(AppError);
    expect(normalized.statusCode).toBe(500);
    expect(normalized.code).toBe('internal_server_error');
  });

  it('normalizes FastifyError without explicit code to status-based code', () => {
    const err = { statusCode: 409, message: 'Conflict happened' };
    const normalized = normalizeError(err);
    expect(normalized.code).toBe('conflict');
    expect(normalized.statusCode).toBe(409);
  });

  it('normalizes FastifyError with validation array', () => {
    const err = { statusCode: 400, message: 'Validation error', validation: [{ keyword: 'type' }] };
    const normalized = normalizeError(err);
    expect(normalized.statusCode).toBe(400);
    expect(normalized.details).toEqual([{ keyword: 'type' }]);
  });

  it('normalizes FastifyError with status 422 without code', () => {
    const err = { statusCode: 422, message: 'Bad entity' };
    expect(normalizeError(err).code).toBe('unprocessable_entity');
  });

  it('falls back to "error" for unknown status codes without code', () => {
    const err = { statusCode: 418, message: 'Teapot' };
    expect(normalizeError(err).code).toBe('error');
  });

  it('hides message for 5xx FastifyErrors', () => {
    const err = { statusCode: 500, message: 'secret error details' };
    const normalized = normalizeError(err);
    expect(normalized.message).toBe('Internal Server Error');
    expect(normalized.expose).toBe(false);
  });
});

describe('extractConstraintName', () => {
  it('extracts constraint from top-level object', () => {
    expect(extractConstraintName({ constraint: 'unique_email' })).toBe('unique_email');
  });

  it('extracts constraint from nested cause', () => {
    const err = { cause: { constraint: 'fk_business_id' } };
    expect(extractConstraintName(err)).toBe('fk_business_id');
  });

  it('returns undefined for non-objects', () => {
    expect(extractConstraintName(null)).toBeUndefined();
    expect(extractConstraintName('string')).toBeUndefined();
  });

  it('returns undefined when no constraint exists', () => {
    expect(extractConstraintName({ other: 'value' })).toBeUndefined();
  });
});
