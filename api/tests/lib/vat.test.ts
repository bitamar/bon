import { describe, expect, it } from 'vitest';
import { calculateLine, calculateInvoiceTotals } from '@bon/types/vat';

describe('calculateLine', () => {
  it('calculates simple whole amounts with 17% VAT', () => {
    const result = calculateLine({
      quantity: 1,
      unitPriceMinorUnits: 10000,
      discountPercent: 0,
      vatRateBasisPoints: 1700,
    });

    expect(result).toEqual({
      grossMinorUnits: 10000,
      discountMinorUnits: 0,
      lineTotalMinorUnits: 10000,
      vatAmountMinorUnits: 1700,
      lineTotalInclVatMinorUnits: 11700,
    });
  });

  it('handles fractional quantity', () => {
    const result = calculateLine({
      quantity: 2.5,
      unitPriceMinorUnits: 10000,
      discountPercent: 0,
      vatRateBasisPoints: 1700,
    });

    expect(result).toEqual({
      grossMinorUnits: 25000,
      discountMinorUnits: 0,
      lineTotalMinorUnits: 25000,
      vatAmountMinorUnits: 4250,
      lineTotalInclVatMinorUnits: 29250,
    });
  });

  it('applies discount correctly', () => {
    const result = calculateLine({
      quantity: 1,
      unitPriceMinorUnits: 10000,
      discountPercent: 10,
      vatRateBasisPoints: 1700,
    });

    expect(result).toEqual({
      grossMinorUnits: 10000,
      discountMinorUnits: 1000,
      lineTotalMinorUnits: 9000,
      vatAmountMinorUnits: 1530,
      lineTotalInclVatMinorUnits: 10530,
    });
  });

  it('handles 100% discount', () => {
    const result = calculateLine({
      quantity: 1,
      unitPriceMinorUnits: 10000,
      discountPercent: 100,
      vatRateBasisPoints: 1700,
    });

    expect(result).toEqual({
      grossMinorUnits: 10000,
      discountMinorUnits: 10000,
      lineTotalMinorUnits: 0,
      vatAmountMinorUnits: 0,
      lineTotalInclVatMinorUnits: 0,
    });
  });

  it('handles 0% VAT (exempt)', () => {
    const result = calculateLine({
      quantity: 1,
      unitPriceMinorUnits: 10000,
      discountPercent: 0,
      vatRateBasisPoints: 0,
    });

    expect(result).toEqual({
      grossMinorUnits: 10000,
      discountMinorUnits: 0,
      lineTotalMinorUnits: 10000,
      vatAmountMinorUnits: 0,
      lineTotalInclVatMinorUnits: 10000,
    });
  });

  it('handles zero unit price (complimentary)', () => {
    const result = calculateLine({
      quantity: 5,
      unitPriceMinorUnits: 0,
      discountPercent: 0,
      vatRateBasisPoints: 1700,
    });

    expect(result).toEqual({
      grossMinorUnits: 0,
      discountMinorUnits: 0,
      lineTotalMinorUnits: 0,
      vatAmountMinorUnits: 0,
      lineTotalInclVatMinorUnits: 0,
    });
  });

  it('rounds correctly for fractional minor units', () => {
    // 3 * 3333 = 9999 exactly, no rounding needed for gross
    // VAT: 9999 * 1700 / 10000 = 1699.83 → rounds to 1700
    const result = calculateLine({
      quantity: 3,
      unitPriceMinorUnits: 3333,
      discountPercent: 0,
      vatRateBasisPoints: 1700,
    });

    expect(result).toEqual({
      grossMinorUnits: 9999,
      discountMinorUnits: 0,
      lineTotalMinorUnits: 9999,
      vatAmountMinorUnits: 1700,
      lineTotalInclVatMinorUnits: 11699,
    });
  });

  it('rounding order matters: gross rounded before discount and VAT', () => {
    // quantity=1.5, unitPriceMinorUnits=3333 → exact gross = 4999.5 → rounded to 5000
    // discount: round(5000 * 33.33 / 100) = round(1666.5) = 1667 (Note: Math.round rounds .5 up)
    // lineTotal: 5000 - 1667 = 3333
    // VAT: round(3333 * 1700 / 10000) = round(566.61) = 567
    //
    // If we had NOT rounded gross first (used 4999.5):
    //   discount = round(4999.5 * 33.33 / 100) = round(1665.8335) = 1666
    //   lineTotal = round(4999.5) - 1666 = 5000 - 1666 = 3334  ← different!
    //   VAT = round(3334 * 1700 / 10000) = round(566.78) = 567
    // So the rounding-first approach gives lineTotal=3333 vs 3334.
    const result = calculateLine({
      quantity: 1.5,
      unitPriceMinorUnits: 3333,
      discountPercent: 33.33,
      vatRateBasisPoints: 1700,
    });

    expect(result).toEqual({
      grossMinorUnits: 5000,
      discountMinorUnits: 1667,
      lineTotalMinorUnits: 3333,
      vatAmountMinorUnits: 567,
      lineTotalInclVatMinorUnits: 3900,
    });
  });
});

describe('calculateInvoiceTotals', () => {
  it('matches calculateLine for a single item', () => {
    const items = [
      { quantity: 1, unitPriceMinorUnits: 10000, discountPercent: 0, vatRateBasisPoints: 1700 },
    ];

    const totals = calculateInvoiceTotals(items);
    const line = calculateLine(items[0]!);

    expect(totals).toEqual({
      subtotalMinorUnits: 10000,
      discountMinorUnits: 0,
      totalExclVatMinorUnits: line.lineTotalMinorUnits,
      vatMinorUnits: line.vatAmountMinorUnits,
      totalInclVatMinorUnits: line.lineTotalInclVatMinorUnits,
    });
  });

  it('sums multiple line items correctly', () => {
    const totals = calculateInvoiceTotals([
      { quantity: 2, unitPriceMinorUnits: 5000, discountPercent: 0, vatRateBasisPoints: 1700 },
      { quantity: 1, unitPriceMinorUnits: 3000, discountPercent: 0, vatRateBasisPoints: 1700 },
    ]);

    // Line 1: gross=10000, discount=0, lineTotal=10000, vat=1700
    // Line 2: gross=3000, discount=0, lineTotal=3000, vat=510
    expect(totals).toEqual({
      subtotalMinorUnits: 13000,
      discountMinorUnits: 0,
      totalExclVatMinorUnits: 13000,
      vatMinorUnits: 2210,
      totalInclVatMinorUnits: 15210,
    });
  });

  it('returns all zeros for empty array', () => {
    const totals = calculateInvoiceTotals([]);

    expect(totals).toEqual({
      subtotalMinorUnits: 0,
      discountMinorUnits: 0,
      totalExclVatMinorUnits: 0,
      vatMinorUnits: 0,
      totalInclVatMinorUnits: 0,
    });
  });

  it('handles mixed VAT rates', () => {
    const totals = calculateInvoiceTotals([
      { quantity: 1, unitPriceMinorUnits: 10000, discountPercent: 0, vatRateBasisPoints: 1700 },
      { quantity: 1, unitPriceMinorUnits: 5000, discountPercent: 0, vatRateBasisPoints: 0 },
    ]);

    // Line 1: gross=10000, vat=1700
    // Line 2: gross=5000, vat=0
    expect(totals).toEqual({
      subtotalMinorUnits: 15000,
      discountMinorUnits: 0,
      totalExclVatMinorUnits: 15000,
      vatMinorUnits: 1700,
      totalInclVatMinorUnits: 16700,
    });
  });

  it('handles multiple items with discounts', () => {
    const totals = calculateInvoiceTotals([
      { quantity: 1, unitPriceMinorUnits: 10000, discountPercent: 10, vatRateBasisPoints: 1700 },
      { quantity: 2, unitPriceMinorUnits: 5000, discountPercent: 20, vatRateBasisPoints: 1700 },
    ]);

    // Line 1: gross=10000, discount=1000, lineTotal=9000, vat=1530
    // Line 2: gross=10000, discount=2000, lineTotal=8000, vat=1360
    expect(totals).toEqual({
      subtotalMinorUnits: 20000,
      discountMinorUnits: 3000,
      totalExclVatMinorUnits: 17000,
      vatMinorUnits: 2890,
      totalInclVatMinorUnits: 19890,
    });
  });
});
