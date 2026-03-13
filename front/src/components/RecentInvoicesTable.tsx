import { Anchor, Badge, Card, Group, Skeleton, Stack, Table, Text } from '@mantine/core';
import { Link, useParams } from 'react-router-dom';
import type { InvoiceListItem } from '@bon/types/invoices';
import { INVOICE_STATUS_CONFIG } from '../lib/invoiceStatus';
import { formatCurrency } from '../lib/format';

export function RecentInvoicesTable({
  invoices,
  isLoading,
}: Readonly<{
  invoices: InvoiceListItem[] | undefined;
  isLoading?: boolean;
}>) {
  const { businessId } = useParams<{ businessId: string }>();

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
        <Anchor component={Link} to={`/businesses/${businessId}/invoices`} size="sm">
          הצג הכל
        </Anchor>
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
            const status = INVOICE_STATUS_CONFIG[invoice.status] ?? {
              label: invoice.status,
              color: 'gray',
            };
            return (
              <Table.Tr key={invoice.id}>
                <Table.Td>
                  <Anchor
                    component={Link}
                    to={`/businesses/${businessId}/invoices/${invoice.id}`}
                    size="sm"
                    fw={500}
                  >
                    {invoice.documentNumber ?? '—'}
                  </Anchor>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{invoice.customerName ?? '—'}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(invoice.totalInclVatMinorUnits)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color={status.color} size="sm">
                    {status.label}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {new Date(invoice.invoiceDate).toLocaleDateString('he-IL')}
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
