import type { FastifyLoggerOptions } from 'fastify';
import pino, { type LoggerOptions as PinoLoggerOptions } from 'pino';
import { env } from '../env.js';

const defaultLevel =
  env.LOG_LEVEL ??
  (env.NODE_ENV === 'test' ? 'warn' : env.NODE_ENV === 'development' ? 'debug' : 'info');

type LoggerConfig = Partial<FastifyLoggerOptions & PinoLoggerOptions>;

export function createLogger(options: LoggerConfig = {}): LoggerConfig {
  const existingFormatters = (options.formatters ?? {}) as NonNullable<
    PinoLoggerOptions['formatters']
  >;
  const formatters: NonNullable<PinoLoggerOptions['formatters']> = {
    ...existingFormatters,
    level: existingFormatters.level ?? ((label: string) => ({ level: label })),
    bindings:
      existingFormatters.bindings ?? ((bindings: Record<string, unknown>) => ({ ...bindings })),
  };

  return {
    ...options,
    level: options.level ?? defaultLevel,
    base: options.base ?? null,
    timestamp: options.timestamp ?? pino.stdTimeFunctions.isoTime,
    formatters,
  };
}
