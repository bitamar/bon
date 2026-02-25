import { Group, Stack, Text } from '@mantine/core';
import { formatMinorUnits } from '@bon/types/formatting';
import { TotalRow } from './TotalRow';

interface InvoiceTotalsSummaryProps {
  subtotalMinorUnits: number;
  discountMinorUnits: number;
  totalExclVatMinorUnits: number;
  vatMinorUnits: number;
  totalInclVatMinorUnits: number;
  vatLabel: string;
}

export function InvoiceTotalsSummary({
  subtotalMinorUnits,
  discountMinorUnits,
  totalExclVatMinorUnits,
  vatMinorUnits,
  totalInclVatMinorUnits,
  vatLabel,
}: Readonly<InvoiceTotalsSummaryProps>) {
  return (
    <Stack gap={4} maw={300} ms="auto">
      <TotalRow label="סה״כ לפני הנחה" value={formatMinorUnits(subtotalMinorUnits)} />
      {discountMinorUnits > 0 && (
        <TotalRow label="הנחה" value={`-${formatMinorUnits(discountMinorUnits)}`} />
      )}
      <TotalRow label="סה״כ לפני מע״מ" value={formatMinorUnits(totalExclVatMinorUnits)} />
      <TotalRow label={vatLabel} value={formatMinorUnits(vatMinorUnits)} />
      <Group justify="space-between" mt="xs">
        <Text fw={700}>סה״כ לתשלום</Text>
        <Text fw={700}>{formatMinorUnits(totalInclVatMinorUnits)}</Text>
      </Group>
    </Stack>
  );
}
