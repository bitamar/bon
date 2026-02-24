/**
 * Compute a human-readable VAT label from the set of VAT rates on an invoice's line items.
 *
 * - Single rate at 0 → "פטור ממע״מ"
 * - Single non-zero rate → "מע״מ X%"
 * - Mixed rates → "מע״מ"
 */
export function computeVatLabel(vatRateBasisPoints: Iterable<number>): string {
  const rates = new Set(vatRateBasisPoints);
  if (rates.size === 1) {
    const rate = [...rates][0] ?? 0;
    return rate === 0 ? 'פטור ממע״מ' : `מע״מ ${rate / 100}%`;
  }
  return 'מע״מ';
}
