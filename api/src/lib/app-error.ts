import type { FastifyError } from 'fastify';

export interface AppErrorOptions {
  statusCode: number;
  code: string;
  message?: string;
  details?: unknown;
  expose?: boolean;
  cause?: unknown;
  extras?: Record<string, unknown> | null;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  readonly expose: boolean;
  readonly extras: Record<string, unknown> | null;

  constructor(options: AppErrorOptions) {
    const { message, cause } = options;
    super(message ?? options.code, cause ? { cause } : undefined);
    this.name = 'AppError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.details = options.details;
    this.expose = options.expose ?? options.statusCode < 500;
    this.extras = options.extras ?? null;
  }
}

export function isFastifyError(error: unknown): error is FastifyError {
  if (!error || typeof error !== 'object') return false;
  return 'statusCode' in error;
}

export function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export function isErrorWithCode(error: unknown, code: string): boolean {
  return extractErrorCode(error) === code;
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (isFastifyError(error)) {
    const statusCode = error.statusCode ?? (error.validation ? 400 : 500);
    const baseCode =
      typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : undefined;
    const code = chooseErrorCode(statusCode, baseCode);

    const validation =
      'validation' in error
        ? ((error as FastifyError & { validation?: unknown }).validation ?? undefined)
        : undefined;
    const additional = collectAdditionalFields(error);
    const extras = deriveExtras(statusCode, additional);
    const strippedAdditional = stripKnownExtras(additional);
    const expose = shouldExpose(statusCode);

    const message = expose ? (error.message ?? code) : 'Internal Server Error';

    const details = mergeDetails(validation, strippedAdditional);

    return new AppError({
      statusCode,
      code,
      message,
      details,
      expose,
      cause: error,
      extras: extras ?? null,
    });
  }

  if (error instanceof Error) {
    return new AppError({
      statusCode: 500,
      code: 'internal_server_error',
      message: 'Internal Server Error',
      expose: false,
      cause: error,
      extras: null,
    });
  }

  return new AppError({
    statusCode: 500,
    code: 'internal_server_error',
    message: 'Internal Server Error',
    expose: false,
    extras: null,
  });
}

function chooseErrorCode(statusCode: number, fallback?: string): string {
  if (statusCode >= 500) return 'internal_server_error';

  if (fallback) {
    // Fastify error codes use uppercase snake case; normalize to lowercase snake case for response
    return fallback.toLowerCase();
  }

  switch (statusCode) {
    case 400:
      return 'invalid_request';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 429:
      return 'too_many_requests';
    case 422:
      return 'unprocessable_entity';
    default:
      return 'error';
  }
}

function shouldExpose(statusCode: number) {
  return statusCode < 500;
}

function collectAdditionalFields(error: FastifyError): Record<string, unknown> | undefined {
  const exclusions = new Set([
    'statusCode',
    'code',
    'name',
    'message',
    'stack',
    'validation',
    'cause',
    'error',
  ]);
  const result: Record<string, unknown> = {};
  const source = error as unknown as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (exclusions.has(key)) continue;
    const value = source[key];
    if (value !== undefined) result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function mergeDetails(validation: unknown, additional: Record<string, unknown> | undefined) {
  if (validation === undefined && additional === undefined) return undefined;
  if (validation !== undefined && additional === undefined) return validation;
  if (validation === undefined && additional !== undefined) return additional;
  return { validation, ...additional } satisfies Record<string, unknown>;
}

function deriveExtras(statusCode: number, additional: Record<string, unknown> | undefined) {
  if (!additional) return undefined;
  if (statusCode !== 429) return undefined;
  const extras: Record<string, unknown> = {};
  if (typeof additional['max'] === 'number') extras['max'] = additional['max'];
  if (typeof (additional as { reset?: unknown })['reset'] === 'number') {
    extras['reset'] = (additional as { reset: number })['reset'];
  } else if (typeof (additional as { ttl?: unknown })['ttl'] === 'number') {
    extras['reset'] = (additional as { ttl: number })['ttl'];
  }
  return Object.keys(extras).length > 0 ? extras : undefined;
}

function stripKnownExtras(additional: Record<string, unknown> | undefined) {
  if (!additional) return undefined;
  const clone: Record<string, unknown> = { ...additional };
  delete clone['max'];
  delete clone['reset'];
  delete clone['ttl'];
  return Object.keys(clone).length > 0 ? clone : undefined;
}

export function badRequest(
  options: Omit<AppErrorOptions, 'statusCode' | 'code'> & { code?: string }
) {
  return new AppError({ statusCode: 400, code: options.code ?? 'invalid_request', ...options });
}

export function notFound(
  options: Omit<AppErrorOptions, 'statusCode' | 'code'> & { code?: string } = {}
) {
  return new AppError({ statusCode: 404, code: options.code ?? 'not_found', ...options });
}

export function unauthorized(
  options: Omit<AppErrorOptions, 'statusCode' | 'code'> & { code?: string } = {}
) {
  return new AppError({ statusCode: 401, code: options.code ?? 'unauthorized', ...options });
}

export function conflict(
  options: Omit<AppErrorOptions, 'statusCode' | 'code'> & { code?: string }
) {
  return new AppError({ statusCode: 409, code: options.code ?? 'conflict', ...options });
}
