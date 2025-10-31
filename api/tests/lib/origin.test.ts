import { describe, expect, it } from 'vitest';
import { isHostAllowed, parseOriginHeader } from '../../src/lib/origin.js';

describe('origin helpers', () => {
  describe('isHostAllowed', () => {
    it('accepts matching host regardless of case', () => {
      expect(isHostAllowed('app.example.com', 'APP.EXAMPLE.COM')).toBe(true);
      expect(isHostAllowed('app.example.com:443', 'app.example.com:443')).toBe(true);
    });

    it('rejects different host values', () => {
      expect(isHostAllowed('app.example.com', 'other.example.com')).toBe(false);
      expect(isHostAllowed('app.example.com', 'app.example.com:8443')).toBe(false);
    });
  });

  describe('parseOriginHeader', () => {
    it('parses valid origins and normalises output', () => {
      const parsed = parseOriginHeader('https://app.example.com/some/path?x=1');
      expect(parsed).toEqual({
        origin: 'https://app.example.com',
        host: 'app.example.com',
      });
    });

    it('returns null for invalid values', () => {
      expect(parseOriginHeader('not-a-url')).toBeNull();
      expect(parseOriginHeader('ftp://app.example.com')).toBeNull();
    });
  });
});
