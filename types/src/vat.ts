import { z } from 'zod';

export const lineItemInputSchema = z.object({
  quantity: z.number().positive(),
  unitPriceMinorUnits: z.number().int().nonnegative(),
  discountPercent: z.number().min(0).max(100),
  vatRateBasisPoints: z.number().int().nonnegative(),
});

export const lineItemResultSchema = z.object({
  grossMinorUnits: z.number().int(),
  discountMinorUnits: z.number().int(),
  lineTotalMinorUnits: z.number().int(),
  vatAmountMinorUnits: z.number().int(),
  lineTotalInclVatMinorUnits: z.number().int(),
});

export const invoiceTotalsSchema = z.object({
  subtotalMinorUnits: z.number().int(),
  discountMinorUnits: z.number().int(),
  totalExclVatMinorUnits: z.number().int(),
  vatMinorUnits: z.number().int(),
  totalInclVatMinorUnits: z.number().int(),
});

export type LineItemInput = z.infer<typeof lineItemInputSchema>;
export type LineItemResult = z.infer<typeof lineItemResultSchema>;
export type InvoiceTotals = z.infer<typeof invoiceTotalsSchema>;

export function calculateLine(item: Readonly<LineItemInput>): LineItemResult {
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
  items: ReadonlyArray<Readonly<LineItemInput>>
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
