import { z } from 'zod';

export const STANDARD_VAT_RATE_BP = 1700;
export const DEFAULT_CURRENCY = 'ILS';

const lineCalcInputSchema = z.object({
  quantity: z.number().positive(),
  unitPriceMinorUnits: z.number().int().nonnegative(),
  discountPercent: z.number().min(0).max(100),
  vatRateBasisPoints: z.number().int().nonnegative(),
});

const lineCalcResultSchema = z.object({
  grossMinorUnits: z.number().int(),
  discountMinorUnits: z.number().int(),
  lineTotalMinorUnits: z.number().int(),
  vatAmountMinorUnits: z.number().int(),
  lineTotalInclVatMinorUnits: z.number().int(),
});

const invoiceTotalsSchema = z.object({
  subtotalMinorUnits: z.number().int(),
  discountMinorUnits: z.number().int(),
  totalExclVatMinorUnits: z.number().int(),
  vatMinorUnits: z.number().int(),
  totalInclVatMinorUnits: z.number().int(),
});

export type LineCalcInput = z.infer<typeof lineCalcInputSchema>;
export type LineCalcResult = z.infer<typeof lineCalcResultSchema>;
export type InvoiceTotals = z.infer<typeof invoiceTotalsSchema>;

export function calculateLine(item: Readonly<LineCalcInput>): LineCalcResult {
  const gross = Math.round(item.quantity * item.unitPriceMinorUnits);
  const discount = Math.round((gross * item.discountPercent) / 100);
  const lineTotal = gross - discount;
  const vatAmount = Math.round((lineTotal * item.vatRateBasisPoints) / 10000);
  return {
    grossMinorUnits: gross,
    discountMinorUnits: discount,
    lineTotalMinorUnits: lineTotal,
    vatAmountMinorUnits: vatAmount,
    lineTotalInclVatMinorUnits: lineTotal + vatAmount,
  };
}

export function calculateInvoiceTotals(
  items: ReadonlyArray<Readonly<LineCalcInput>>
): InvoiceTotals {
  let subtotalMinorUnits = 0;
  let discountMinorUnits = 0;
  let totalExclVatMinorUnits = 0;
  let vatMinorUnits = 0;

  for (const item of items) {
    const line = calculateLine(item);
    subtotalMinorUnits += line.grossMinorUnits;
    discountMinorUnits += line.discountMinorUnits;
    totalExclVatMinorUnits += line.lineTotalMinorUnits;
    vatMinorUnits += line.vatAmountMinorUnits;
  }

  return {
    subtotalMinorUnits,
    discountMinorUnits,
    totalExclVatMinorUnits,
    vatMinorUnits,
    totalInclVatMinorUnits: totalExclVatMinorUnits + vatMinorUnits,
  };
}
