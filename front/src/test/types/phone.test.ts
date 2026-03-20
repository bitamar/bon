import { describe, expect, it } from 'vitest';
import { normalizeIsraeliPhone, toE164 } from '@bon/types/phone';

describe('phone utilities', () => {
  describe('normalizeIsraeliPhone', () => {
    it.each([
      ['10-digit mobile as-is', '0521234567', '0521234567'],
      ['9-digit landline as-is', '021234567', '021234567'],
      ['strips hyphens', '052-123-4567', '0521234567'],
      ['strips spaces', '052 123 4567', '0521234567'],
      ['strips parentheses and dots', '(052) 123.4567', '0521234567'],
      ['converts +972 mobile to local', '+972521234567', '0521234567'],
      ['converts 972 without plus (12 digits)', '972521234567', '0521234567'],
      ['converts 972 landline (11 digits)', '97221234567', '021234567'],
      ['converts 972 with leading zero (13 digits)', '9720521234567', '0521234567'],
      ['handles formatted +972 with hyphens', '+972-52-123-4567', '0521234567'],
    ])('%s: %s → %s', (_label, input, expected) => {
      expect(normalizeIsraeliPhone(input)).toBe(expected);
    });

    it('accepts all valid area codes 02-09', () => {
      for (let d = 2; d <= 9; d++) {
        expect(normalizeIsraeliPhone(`0${d}1234567`)).toBe(`0${d}1234567`);
      }
    });

    it.each([
      ['empty string', ''],
      ['non-digit input', 'abc'],
      ['too-short number', '123'],
      ['not starting with 0', '1234567890'],
      ['invalid area code 01', '0112345678'],
      ['972 prefix too few digits (10)', '9722123456'],
      ['972 prefix too many digits (14)', '97205212345678'],
    ])('rejects %s: %s', (_label, input) => {
      expect(() => normalizeIsraeliPhone(input)).toThrow('Invalid Israeli phone number');
    });

    it('does not leak digits in error message', () => {
      try {
        normalizeIsraeliPhone('9991234');
      } catch (e) {
        expect((e as Error).message).not.toMatch(/\d/);
      }
    });
  });

  describe('toE164', () => {
    it.each([
      ['local mobile', '0521234567', '+972521234567'],
      ['local landline', '021234567', '+97221234567'],
      ['formatted input', '052-123-4567', '+972521234567'],
      ['+972 round-trip', '+972521234567', '+972521234567'],
    ])('converts %s: %s → %s', (_label, input, expected) => {
      expect(toE164(input)).toBe(expected);
    });

    it('throws for invalid input', () => {
      expect(() => toE164('123')).toThrow('Invalid Israeli phone number');
    });
  });
});
