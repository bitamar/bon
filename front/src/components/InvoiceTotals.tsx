import { Group, Stack, Text } from '@mantine/core';
import { calculateInvoiceTotals } from '@bon/types/vat';
import { formatAgora } from '../lib/format';
import type { LineItemFormRow } from './InvoiceLineItems';

interface InvoiceTotalsProps {
  items: LineItemFormRow[];
}

function getVatLabel(items: ReadonlyArray<Readonly<LineItemFormRow>>): string {
  const rates = new Set(items.map((i) => i.vatRateBasisPoints));
  if (rates.size === 1) {
    const rate = [...rates][0] ?? 0;
    return rate === 0 ? 'פטור ממע״מ' : `מע״מ ${rate / 100}%`;
  }
  return 'מע״מ';
}

export function InvoiceTotals({ items }: Readonly<InvoiceTotalsProps>) {
  const lineInputs = items.map((row) => ({
    quantity: row.quantity,
    unitPriceAgora: Math.round(row.unitPriceShekel * 100),
    discountPercent: row.discountPercent,
    vatRateBasisPoints: row.vatRateBasisPoints,
  }));

  const totals = calculateInvoiceTotals(lineInputs);
  const vatLabel = getVatLabel(items);

  return (
    <Stack gap={4} maw={300} ms="auto">
      <TotalRow label="סה״כ לפני הנחה" value={formatAgora(totals.subtotalAgora)} />
      {totals.discountAgora > 0 && (
        <TotalRow label="הנחה" value={formatAgora(totals.discountAgora)} />
      )}
      <TotalRow label="סה״כ לפני מע״מ" value={formatAgora(totals.totalExclVatAgora)} />
      <TotalRow label={vatLabel} value={formatAgora(totals.vatAgora)} />
      <Group justify="space-between" mt="xs">
        <Text fw={700}>סה״כ</Text>
        <Text fw={700}>{formatAgora(totals.totalInclVatAgora)}</Text>
      </Group>
    </Stack>
  );
}

function TotalRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <Group justify="space-between">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </Group>
  );
}
