import { z } from 'zod';

export const lineItemInputSchema = z.object({
  quantity: z.number().positive(),
  unitPriceAgora: z.number().int().nonnegative(),
  discountPercent: z.number().min(0).max(100),
  vatRateBasisPoints: z.number().int().nonnegative(),
});

export const lineItemResultSchema = z.object({
  grossAgora: z.number().int(),
  discountAgora: z.number().int(),
  lineTotalAgora: z.number().int(),
  vatAmountAgora: z.number().int(),
  lineTotalInclVatAgora: z.number().int(),
});

export const invoiceTotalsSchema = z.object({
  subtotalAgora: z.number().int(),
  discountAgora: z.number().int(),
  totalExclVatAgora: z.number().int(),
  vatAgora: z.number().int(),
  totalInclVatAgora: z.number().int(),
});

export type LineItemInput = z.infer<typeof lineItemInputSchema>;
export type LineItemResult = z.infer<typeof lineItemResultSchema>;
export type InvoiceTotals = z.infer<typeof invoiceTotalsSchema>;

export function calculateLine(item: Readonly<LineItemInput>): LineItemResult {
  const gross = Math.round(item.quantity * item.unitPriceAgora);
  const discount = Math.round((gross * item.discountPercent) / 100);
  const lineTotal = gross - discount;
  const vatAmount = Math.round((lineTotal * item.vatRateBasisPoints) / 10000);
  return {
    grossAgora: gross,
    discountAgora: discount,
    lineTotalAgora: lineTotal,
    vatAmountAgora: vatAmount,
    lineTotalInclVatAgora: lineTotal + vatAmount,
  };
}

export function calculateInvoiceTotals(
  items: ReadonlyArray<Readonly<LineItemInput>>
): InvoiceTotals {
  let subtotalAgora = 0;
  let discountAgora = 0;
  let totalExclVatAgora = 0;
  let vatAgora = 0;

  for (const item of items) {
    const line = calculateLine(item);
    subtotalAgora += line.grossAgora;
    discountAgora += line.discountAgora;
    totalExclVatAgora += line.lineTotalAgora;
    vatAgora += line.vatAmountAgora;
  }

  return {
    subtotalAgora,
    discountAgora,
    totalExclVatAgora,
    vatAgora,
    totalInclVatAgora: totalExclVatAgora + vatAgora,
  };
}
