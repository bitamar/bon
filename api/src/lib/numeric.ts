import { AppError } from './app-error.js';

/**
 * Converts a Drizzle numeric column value (string) to a finite number.
 * Throws AppError if the value is not a finite number.
 */
export function toNumber(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new AppError({
      statusCode: 500,
      code: 'invalid_numeric_value',
      message: `Expected a finite number, got: ${value}`,
    });
  }
  return n;
}
