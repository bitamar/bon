import { describe, expect, it } from 'vitest';
import {
  requiresAllocationNumber,
  shouldRequestAllocation,
  currentThresholdILS,
} from '@bon/types/shaam';

// ── helpers ──

function makeInvoice(totalExclVatMinorUnits: number, vatMinorUnits: number) {
  return { totalExclVatMinorUnits, vatMinorUnits };
}

function makeLicensedDealer() {
  return { isLicensedDealer: true };
}

function makeNonDealer() {
  return { isLicensedDealer: false };
}

describe('currentThresholdILS', () => {
  it('returns 25,000 for dates in 2024', () => {
    expect(currentThresholdILS(new Date('2024-06-15'))).toBe(25_000);
  });

  it('returns 20,000 for dates in 2025', () => {
    expect(currentThresholdILS(new Date('2025-01-01'))).toBe(20_000);
    expect(currentThresholdILS(new Date('2025-12-31'))).toBe(20_000);
  });

  it('returns 10,000 for dates from Jan 2026', () => {
    expect(currentThresholdILS(new Date('2026-01-01'))).toBe(10_000);
    expect(currentThresholdILS(new Date('2026-05-31'))).toBe(10_000);
  });

  it('returns 5,000 for dates from Jun 2026', () => {
    expect(currentThresholdILS(new Date('2026-06-01'))).toBe(5_000);
    expect(currentThresholdILS(new Date('2027-01-01'))).toBe(5_000);
  });

  it('falls back to oldest threshold for dates before 2024', () => {
    expect(currentThresholdILS(new Date('2023-01-01'))).toBe(25_000);
  });
});

describe('requiresAllocationNumber', () => {
  const jan2026 = new Date('2026-01-15');

  it('returns true when above threshold and licensed dealer with VAT', () => {
    // Threshold in Jan 2026 = 10,000 ILS = 1,000,000 minor units
    const invoice = makeInvoice(1_000_001, 170_000);
    expect(requiresAllocationNumber(invoice, makeLicensedDealer(), jan2026)).toBe(true);
  });

  it('returns false when below threshold', () => {
    const invoice = makeInvoice(500_000, 85_000);
    expect(requiresAllocationNumber(invoice, makeLicensedDealer(), jan2026)).toBe(false);
  });

  it('returns false when exactly at threshold (not strictly above)', () => {
    // Exactly 10,000 ILS = 1,000,000 minor units — not above, so false
    const invoice = makeInvoice(1_000_000, 170_000);
    expect(requiresAllocationNumber(invoice, makeLicensedDealer(), jan2026)).toBe(false);
  });

  it('returns false when customer is not a licensed dealer', () => {
    const invoice = makeInvoice(2_000_000, 340_000);
    expect(requiresAllocationNumber(invoice, makeNonDealer(), jan2026)).toBe(false);
  });

  it('returns false when VAT is zero regardless of amount', () => {
    const invoice = makeInvoice(5_000_000, 0);
    expect(requiresAllocationNumber(invoice, makeLicensedDealer(), jan2026)).toBe(false);
  });

  it('uses correct threshold at date boundary: 2025-12-31 vs 2026-01-01', () => {
    // 15,000 ILS = 1,500,000 minor units
    // In 2025: threshold is 20,000 ILS → 1,500,000 < 2,000,000 → false
    // In 2026: threshold is 10,000 ILS → 1,500,000 > 1,000,000 → true
    const invoice = makeInvoice(1_500_000, 255_000);
    expect(requiresAllocationNumber(invoice, makeLicensedDealer(), new Date('2025-12-31'))).toBe(
      false
    );
    expect(requiresAllocationNumber(invoice, makeLicensedDealer(), new Date('2026-01-01'))).toBe(
      true
    );
  });

  it('uses correct threshold at Jun 2026 boundary', () => {
    // 7,000 ILS = 700,000 minor units
    // May 2026: threshold is 10,000 ILS → 700,000 < 1,000,000 → false
    // Jun 2026: threshold is 5,000 ILS → 700,000 > 500,000 → true
    const invoice = makeInvoice(700_000, 119_000);
    expect(requiresAllocationNumber(invoice, makeLicensedDealer(), new Date('2026-05-31'))).toBe(
      false
    );
    expect(requiresAllocationNumber(invoice, makeLicensedDealer(), new Date('2026-06-01'))).toBe(
      true
    );
  });
});

describe('shouldRequestAllocation', () => {
  it('delegates to requiresAllocationNumber', () => {
    const jan2026 = new Date('2026-01-15');
    const invoice = makeInvoice(1_000_001, 170_000);
    expect(shouldRequestAllocation(invoice, makeLicensedDealer(), jan2026)).toBe(true);
    expect(shouldRequestAllocation(invoice, makeNonDealer(), jan2026)).toBe(false);
  });
});
