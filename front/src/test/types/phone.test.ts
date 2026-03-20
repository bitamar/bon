import { describe, expect, it } from 'vitest';
import { normalizeIsraeliPhone, toE164 } from '@bon/types/phone';

describe('phone utilities', () => {
  describe('normalizeIsraeliPhone', () => {
    // ── helpers ──
    function expectNormalized(input: string, expected: string) {
      expect(normalizeIsraeliPhone(input)).toBe(expected);
    }

    function expectInvalid(input: string) {
      expect(() => normalizeIsraeliPhone(input)).toThrow('Invalid Israeli phone number');
    }

    it('accepts 10-digit mobile as-is', () => {
      expectNormalized('0521234567', '0521234567');
    });

    it('accepts 9-digit landline as-is', () => {
      expectNormalized('021234567', '021234567');
    });

    it('strips hyphens', () => {
      expectNormalized('052-123-4567', '0521234567');
    });

    it('strips spaces', () => {
      expectNormalized('052 123 4567', '0521234567');
    });

    it('strips parentheses and dots', () => {
      expectNormalized('(052) 123.4567', '0521234567');
    });

    it('converts +972 mobile to local', () => {
      expectNormalized('+972521234567', '0521234567');
    });

    it('converts 972 mobile without plus (12 digits)', () => {
      expectNormalized('972521234567', '0521234567');
    });

    it('converts 972 landline (11 digits)', () => {
      expectNormalized('97221234567', '021234567');
    });

    it('converts 972 with leading zero mobile (13 digits)', () => {
      expectNormalized('9720521234567', '0521234567');
    });

    it('handles formatted +972 with hyphens', () => {
      expectNormalized('+972-52-123-4567', '0521234567');
    });

    it('accepts all valid area codes 02-09', () => {
      for (let d = 2; d <= 9; d++) {
        expectNormalized(`0${d}1234567`, `0${d}1234567`);
      }
    });

    it('rejects empty string', () => {
      expectInvalid('');
    });

    it('rejects non-digit input', () => {
      expectInvalid('abc');
    });

    it('rejects too-short number', () => {
      expectInvalid('123');
    });

    it('rejects number not starting with 0', () => {
      expectInvalid('1234567890');
    });

    it('rejects invalid area code 01', () => {
      expectInvalid('0112345678');
    });

    it('rejects 972 prefix with too few digits (10 total)', () => {
      expectInvalid('9722123456');
    });

    it('rejects 972 prefix with too many digits (14 total)', () => {
      expectInvalid('97205212345678');
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
    it('converts local mobile to E.164', () => {
      expect(toE164('0521234567')).toBe('+972521234567');
    });

    it('converts local landline to E.164', () => {
      expect(toE164('021234567')).toBe('+97221234567');
    });

    it('converts formatted input to E.164', () => {
      expect(toE164('052-123-4567')).toBe('+972521234567');
    });

    it('handles +972 input as round-trip', () => {
      expect(toE164('+972521234567')).toBe('+972521234567');
    });

    it('throws for invalid input', () => {
      expect(() => toE164('123')).toThrow('Invalid Israeli phone number');
    });
  });
});
