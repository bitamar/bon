import { describe, it, expect } from 'vitest';
import { computeVatLabel } from '../../lib/vatLabel';

describe('computeVatLabel', () => {
  it('returns "פטור ממע״מ" for a single rate of 0', () => {
    expect(computeVatLabel([0])).toBe('פטור ממע״מ');
  });

  it('returns "מע״מ 17%" for a single rate of 1700 basis points', () => {
    expect(computeVatLabel([1700])).toBe('מע״מ 17%');
  });

  it('returns generic "מע״מ" for mixed rates', () => {
    expect(computeVatLabel([1700, 0])).toBe('מע״מ');
  });

  it('handles empty iterable by returning generic "מע״מ"', () => {
    // Empty set has size 0, so goes to the last return
    expect(computeVatLabel([])).toBe('מע״מ');
  });
});
