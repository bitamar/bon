import { Group, Paper, Text } from '@mantine/core';
import { formatMinorUnits } from '@bon/types/formatting';
import type { InvoiceListAggregates } from '@bon/types/invoices';

export function InvoiceSummaryRow({ aggregates }: Readonly<{ aggregates: InvoiceListAggregates }>) {
  return (
    <Paper withBorder p="sm">
      <Group justify="space-between">
        <Group gap="xs">
          <Text size="sm" fw={600}>
            ממתין לתשלום:
          </Text>
          <Text size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatMinorUnits(aggregates.totalOutstandingMinorUnits)}
          </Text>
          <Text size="sm" c="dimmed">
            ({aggregates.countOutstanding}{' '}
            {aggregates.countOutstanding === 1 ? 'חשבונית' : 'חשבוניות'})
          </Text>
        </Group>
        <Group gap="xs">
          <Text size="sm" fw={600}>
            סה״כ בסינון:
          </Text>
          <Text size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatMinorUnits(aggregates.totalFilteredMinorUnits)}
          </Text>
        </Group>
      </Group>
    </Paper>
  );
}
