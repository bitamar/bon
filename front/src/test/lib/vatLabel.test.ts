import { describe, it, expect } from 'vitest';
import { computeVatLabel } from '../../lib/vatLabel';

describe('computeVatLabel', () => {
  it('returns "פטור ממע״מ" for a single 0 rate', () => {
    expect(computeVatLabel([0])).toBe('פטור ממע״מ');
  });

  it('returns "מע״מ X%" for a single non-zero rate', () => {
    expect(computeVatLabel([1700])).toBe('מע״מ 17%');
  });

  it('returns "מע״מ" for mixed rates', () => {
    expect(computeVatLabel([0, 1700])).toBe('מע״מ');
  });
});
