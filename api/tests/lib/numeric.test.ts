import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/lib/app-error.js';
import { toNumber } from '../../src/lib/numeric.js';

describe('toNumber', () => {
  it('converts an integer string to a number', () => {
    expect(toNumber('42')).toBe(42);
  });

  it('converts a decimal string to a number', () => {
    expect(toNumber('3.14')).toBeCloseTo(3.14);
  });

  it('throws AppError for "NaN"', () => {
    expect(() => toNumber('NaN')).toThrow(AppError);
    try {
      toNumber('NaN');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('invalid_numeric_value');
      expect((err as AppError).statusCode).toBe(500);
    }
  });

  it('throws AppError for "Infinity"', () => {
    expect(() => toNumber('Infinity')).toThrow(AppError);
    try {
      toNumber('Infinity');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('invalid_numeric_value');
    }
  });

  it('throws AppError for a non-numeric string', () => {
    expect(() => toNumber('abc')).toThrow(AppError);
    try {
      toNumber('abc');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('invalid_numeric_value');
      expect((err as AppError).message).toContain('abc');
    }
  });
});
