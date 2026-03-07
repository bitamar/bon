import { describe, it, expect } from 'vitest';
import { currentThresholdILS } from '@bon/types/shaam';

describe('currentThresholdILS', () => {
  it('returns ₪20,000 for dates in 2025', () => {
    expect(currentThresholdILS(new Date('2025-12-31'))).toBe(20_000);
    expect(currentThresholdILS(new Date('2025-06-15'))).toBe(20_000);
  });

  it('returns ₪10,000 for Jan-May 2026', () => {
    expect(currentThresholdILS(new Date('2026-01-01'))).toBe(10_000);
    expect(currentThresholdILS(new Date('2026-03-15'))).toBe(10_000);
    expect(currentThresholdILS(new Date('2026-05-31'))).toBe(10_000);
  });

  it('returns ₪5,000 from June 2026 onward', () => {
    expect(currentThresholdILS(new Date('2026-06-01'))).toBe(5_000);
    expect(currentThresholdILS(new Date('2026-12-31'))).toBe(5_000);
    expect(currentThresholdILS(new Date('2027-01-01'))).toBe(5_000);
  });
});
