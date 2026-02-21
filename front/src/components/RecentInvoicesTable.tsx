import { Badge, Card, Group, Skeleton, Stack, Table, Text } from '@mantine/core';
import type { RecentInvoice } from '../hooks/useDashboardData';
import { formatCurrency } from '../hooks/useDashboardData';

const STATUS_CONFIG: Record<RecentInvoice['status'], { label: string; color: string }> = {
  draft: { label: 'טיוטה', color: 'gray' },
  sent: { label: 'נשלחה', color: 'blue' },
  paid: { label: 'שולמה', color: 'brand' },
  overdue: { label: 'באיחור', color: 'red' },
};

export function RecentInvoicesTable({
  invoices,
  isLoading,
}: Readonly<{
  invoices: RecentInvoice[] | undefined;
  isLoading?: boolean;
}>) {
  if (isLoading) {
    return (
      <Card withBorder radius="lg" p="lg">
        <Stack gap="sm">
          <Skeleton height={18} width="30%" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} height={36} />
          ))}
        </Stack>
      </Card>
    );
  }

  if (!invoices || invoices.length === 0) {
    return (
      <Card withBorder radius="lg" p="lg">
        <Text c="dimmed" ta="center" py="xl">
          אין חשבוניות להצגה
        </Text>
      </Card>
    );
  }

  return (
    <Card withBorder radius="lg" p="lg">
      <Group justify="space-between" mb="md">
        <Text fw={600}>חשבוניות אחרונות</Text>
      </Group>
      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>מספר</Table.Th>
            <Table.Th>לקוח</Table.Th>
            <Table.Th>סכום</Table.Th>
            <Table.Th>סטטוס</Table.Th>
            <Table.Th>תאריך</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {invoices.map((invoice) => {
            const status = STATUS_CONFIG[invoice.status];
            return (
              <Table.Tr key={invoice.id}>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {invoice.number}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{invoice.customer}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(invoice.amount)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color={status.color} size="sm">
                    {status.label}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {new Date(invoice.date).toLocaleDateString('he-IL')}
                  </Text>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Card>
  );
}
