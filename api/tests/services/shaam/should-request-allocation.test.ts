import { describe, it, expect } from 'vitest';
import { shouldRequestAllocation } from '@bon/types/shaam';

describe('shouldRequestAllocation', () => {
  it('returns false when VAT is zero', () => {
    const result = shouldRequestAllocation(
      { vatMinorUnits: 0, totalExclVatMinorUnits: 2_000_000 },
      { isLicensedDealer: true },
      new Date('2026-03-01')
    );
    expect(result).toBe(false);
  });

  it('returns false when customer is not a licensed dealer', () => {
    const result = shouldRequestAllocation(
      { vatMinorUnits: 170_000, totalExclVatMinorUnits: 2_000_000 },
      { isLicensedDealer: false },
      new Date('2026-03-01')
    );
    expect(result).toBe(false);
  });

  it('returns false when amount is at or below threshold (Jan-May 2026: ₪10,000)', () => {
    const result = shouldRequestAllocation(
      { vatMinorUnits: 170_000, totalExclVatMinorUnits: 1_000_000 },
      { isLicensedDealer: true },
      new Date('2026-03-01')
    );
    expect(result).toBe(false);
  });

  it('returns true when amount exceeds threshold (Jan-May 2026: > ₪10,000)', () => {
    const result = shouldRequestAllocation(
      { vatMinorUnits: 170_001, totalExclVatMinorUnits: 1_000_001 },
      { isLicensedDealer: true },
      new Date('2026-03-01')
    );
    expect(result).toBe(true);
  });

  it('uses ₪5,000 threshold from June 2026 onward', () => {
    const below = shouldRequestAllocation(
      { vatMinorUnits: 85_000, totalExclVatMinorUnits: 500_000 },
      { isLicensedDealer: true },
      new Date('2026-06-01')
    );
    expect(below).toBe(false);

    const above = shouldRequestAllocation(
      { vatMinorUnits: 85_001, totalExclVatMinorUnits: 500_001 },
      { isLicensedDealer: true },
      new Date('2026-06-01')
    );
    expect(above).toBe(true);
  });

  it('uses ₪20,000 threshold before Jan 2026', () => {
    const below = shouldRequestAllocation(
      { vatMinorUnits: 340_000, totalExclVatMinorUnits: 2_000_000 },
      { isLicensedDealer: true },
      new Date('2025-12-31')
    );
    expect(below).toBe(false);

    const above = shouldRequestAllocation(
      { vatMinorUnits: 340_001, totalExclVatMinorUnits: 2_000_001 },
      { isLicensedDealer: true },
      new Date('2025-12-31')
    );
    expect(above).toBe(true);
  });
});
