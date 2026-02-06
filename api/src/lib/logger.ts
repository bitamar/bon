import type { FastifyLoggerOptions } from 'fastify';
import pino, { type LoggerOptions as PinoLoggerOptions } from 'pino';
import { env } from '../env.js';

function resolveDefaultLevel(): string {
  if (env.LOG_LEVEL != null) return env.LOG_LEVEL;
  if (env.NODE_ENV === 'test') return 'warn';
  if (env.NODE_ENV === 'development') return 'debug';
  return 'info';
}

const defaultLevel = resolveDefaultLevel();

type LoggerConfig = Partial<FastifyLoggerOptions & PinoLoggerOptions>;

export function createLogger(options: LoggerConfig = {}): LoggerConfig {
  const existingFormatters: NonNullable<PinoLoggerOptions['formatters']> = options.formatters ?? {};
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
