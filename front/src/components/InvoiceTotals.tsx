import { Group, Stack, Text } from '@mantine/core';
import { calculateInvoiceTotals } from '@bon/types/vat';
import { formatMinorUnits, toMinorUnits } from '@bon/types/formatting';
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
    unitPriceMinorUnits: toMinorUnits(row.unitPrice),
    discountPercent: row.discountPercent,
    vatRateBasisPoints: row.vatRateBasisPoints,
  }));

  const totals = calculateInvoiceTotals(lineInputs);
  const vatLabel = getVatLabel(items);

  return (
    <Stack gap={4} maw={300} ms="auto">
      <TotalRow label="סה״כ לפני הנחה" value={formatMinorUnits(totals.subtotalMinorUnits)} />
      {totals.discountMinorUnits > 0 && (
        <TotalRow label="הנחה" value={formatMinorUnits(totals.discountMinorUnits)} />
      )}
      <TotalRow label="סה״כ לפני מע״מ" value={formatMinorUnits(totals.totalExclVatMinorUnits)} />
      <TotalRow label={vatLabel} value={formatMinorUnits(totals.vatMinorUnits)} />
      <Group justify="space-between" mt="xs">
        <Text fw={700}>סה״כ</Text>
        <Text fw={700}>{formatMinorUnits(totals.totalInclVatMinorUnits)}</Text>
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
