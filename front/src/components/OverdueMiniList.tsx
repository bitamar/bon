import { Anchor, Card, Group, Skeleton, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconCheck, IconClock } from '@tabler/icons-react';
import { Link, useParams } from 'react-router-dom';
import type { InvoiceListItem } from '@bon/types/invoices';
import { formatCurrency } from '../lib/format';

function daysOverdue(dueDate: string | null): number {
  if (!dueDate) return 0;
  const parts = dueDate.split('-').map(Number);
  const dueUtc = Date.UTC(parts[0]!, parts[1]! - 1, parts[2]);
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.floor((todayUtc - dueUtc) / 86_400_000));
}

export function OverdueMiniList({
  invoices,
  isLoading,
  error,
}: Readonly<{
  invoices: InvoiceListItem[];
  isLoading?: boolean;
  error?: Error | string;
}>) {
  const { businessId } = useParams<{ businessId: string }>();

  if (isLoading) {
    return (
      <Card withBorder radius="lg" p="lg">
        <Skeleton height={18} width="30%" mb="md" />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} height={28} mb="xs" />
        ))}
      </Card>
    );
  }

  if (error) {
    return (
      <Card withBorder radius="lg" p="lg">
        <Text fw={600} mb="md">
          פגות מועד
        </Text>
        <Text c="red" size="sm" ta="center" py="md">
          שגיאה בטעינת הנתונים
        </Text>
      </Card>
    );
  }

  return (
    <Card withBorder radius="lg" p="lg">
      <Text fw={600} mb="md">
        פגות מועד
      </Text>
      {invoices.length === 0 ? (
        <Group gap="xs" justify="center" py="md">
          <ThemeIcon variant="light" color="green" size="sm" radius="xl">
            <IconCheck size={14} />
          </ThemeIcon>
          <Text size="sm" c="green.7">
            אין חשבוניות פגות מועד
          </Text>
        </Group>
      ) : (
        <Stack gap="xs">
          {invoices.map((inv) => {
            const days = daysOverdue(inv.dueDate);
            return (
              <Group key={inv.id} justify="space-between" wrap="nowrap">
                <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
                  <Anchor
                    component={Link}
                    to={`/businesses/${businessId}/invoices/${inv.id}`}
                    size="sm"
                    truncate
                  >
                    {inv.customerName ?? inv.documentNumber ?? '—'}
                  </Anchor>
                  <Group gap={4}>
                    <IconClock
                      size={12}
                      color={
                        days > 30 ? 'var(--mantine-color-red-6)' : 'var(--mantine-color-orange-6)'
                      }
                    />
                    <Text size="xs" c={days > 30 ? 'red.6' : 'orange.6'}>
                      {days} ימים
                    </Text>
                  </Group>
                </Stack>
                <Text
                  size="sm"
                  fw={500}
                  {...(days > 30 ? { c: 'red' as const } : {})}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatCurrency(inv.totalInclVatMinorUnits)}
                </Text>
              </Group>
            );
          })}
        </Stack>
      )}
    </Card>
  );
}
