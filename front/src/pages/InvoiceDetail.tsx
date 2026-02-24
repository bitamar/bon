import {
  Badge,
  Button,
  Container,
  Divider,
  Group,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { IconFileDownload, IconMail, IconCash, IconReceiptRefund } from '@tabler/icons-react';
import { Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageTitle } from '../components/PageTitle';
import { StatusCard } from '../components/StatusCard';
import { fetchInvoice } from '../api/invoices';
import { queryKeys } from '../lib/queryKeys';
import { useBusiness } from '../contexts/BusinessContext';
import { formatMinorUnits } from '@bon/types/formatting';
import { DOCUMENT_TYPE_LABELS, type InvoiceStatus } from '@bon/types/invoices';
import { INVOICE_STATUS_CONFIG } from '../lib/invoiceStatus';

function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function formatDateOnly(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

const CREDIT_NOTE_ELIGIBLE: InvoiceStatus[] = ['finalized', 'sent', 'paid', 'partially_paid'];

function DetailSkeleton() {
  return (
    <Container size="lg" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <Stack gap={4}>
            <Skeleton h={32} w={200} />
            <Skeleton h={20} w={150} />
          </Stack>
          <Skeleton h={28} w={80} radius="xl" />
        </Group>
        <Paper withBorder p="md" radius="md">
          <Group gap="sm">
            <Skeleton h={36} w={100} />
            <Skeleton h={36} w={100} />
            <Skeleton h={36} w={100} />
          </Group>
        </Paper>
        <Paper withBorder p="lg" radius="md">
          <Stack gap="md">
            <Skeleton h={24} w={300} />
            <Skeleton h={20} w={200} />
            <Skeleton h={150} />
            <Skeleton h={80} />
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}

export function InvoiceDetail() {
  const { invoiceId = '' } = useParams<{ invoiceId: string }>();
  const { activeBusiness } = useBusiness();

  const businessId = activeBusiness?.id ?? '';

  const invoiceQuery = useQuery({
    queryKey: queryKeys.invoice(businessId, invoiceId),
    queryFn: () => fetchInvoice(businessId, invoiceId),
    enabled: !!activeBusiness && !!invoiceId,
  });

  // ── Guards ──

  if (!activeBusiness) {
    return (
      <Container size="lg" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard status="error" title="לא נבחר עסק" description="אנא בחר עסק מהתפריט העליון" />
      </Container>
    );
  }

  if (invoiceQuery.isPending) {
    return <DetailSkeleton />;
  }

  if (invoiceQuery.error) {
    return (
      <Container size="lg" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard
          status="error"
          title="לא הצלחנו לטעון את החשבונית"
          primaryAction={{
            label: 'נסה שוב',
            onClick: () => invoiceQuery.refetch(),
            loading: invoiceQuery.isFetching,
          }}
        />
      </Container>
    );
  }

  const { invoice, items } = invoiceQuery.data;

  // Draft invoices redirect to edit page
  if (invoice.status === 'draft') {
    return <Navigate to={`/business/invoices/${invoiceId}/edit`} replace />;
  }

  const statusConfig = INVOICE_STATUS_CONFIG[invoice.status as InvoiceStatus];
  const documentTypeLabel =
    DOCUMENT_TYPE_LABELS[invoice.documentType as keyof typeof DOCUMENT_TYPE_LABELS] ??
    invoice.documentType;
  const showCreditNote = CREDIT_NOTE_ELIGIBLE.includes(invoice.status as InvoiceStatus);

  // VAT label
  const vatRates = new Set(items.map((i) => i.vatRateBasisPoints));
  const vatLabel =
    vatRates.size === 1
      ? ([...vatRates][0] ?? 0) === 0
        ? 'פטור ממע״מ'
        : `מע״מ ${([...vatRates][0] ?? 0) / 100}%`
      : 'מע״מ';

  return (
    <Container size="lg" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Group gap="sm" align="center">
              <PageTitle order={3}>{invoice.documentNumber ?? documentTypeLabel}</PageTitle>
              <Badge color={statusConfig.color} variant="light" size="lg">
                {statusConfig.label}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed">
              {documentTypeLabel}
            </Text>
            <Group gap="lg">
              <Text size="sm">תאריך: {formatDateOnly(invoice.invoiceDate)}</Text>
              {invoice.issuedAt && (
                <Text size="sm" c="dimmed">
                  הופקה: {formatDateTime(invoice.issuedAt)}
                </Text>
              )}
              {invoice.dueDate && (
                <Text size="sm" c="dimmed">
                  תאריך תשלום: {formatDateOnly(invoice.dueDate)}
                </Text>
              )}
            </Group>
          </Stack>
          <Text size="xl" fw={700}>
            {formatMinorUnits(invoice.totalInclVatMinorUnits)}
          </Text>
        </Group>

        {/* Action bar */}
        <Paper withBorder p="md" radius="md">
          <Group gap="sm">
            <Button
              variant="light"
              leftSection={<IconFileDownload size={16} />}
              disabled
              title="יהיה זמין בקרוב"
            >
              הורד PDF
            </Button>
            <Button
              variant="light"
              leftSection={<IconMail size={16} />}
              disabled
              title="יהיה זמין בקרוב"
            >
              שלח במייל
            </Button>
            <Button
              variant="light"
              leftSection={<IconCash size={16} />}
              disabled
              title="יהיה זמין בקרוב"
            >
              סמן כשולם
            </Button>
            {showCreditNote && (
              <Button
                variant="light"
                leftSection={<IconReceiptRefund size={16} />}
                disabled
                title="יהיה זמין בקרוב"
              >
                הפק חשבונית זיכוי
              </Button>
            )}
          </Group>
        </Paper>

        {/* Allocation number */}
        {invoice.allocationNumber && (
          <Paper withBorder p="md" radius="md" bg="blue.0">
            <Group gap="sm">
              <Text fw={600}>מספר הקצאה:</Text>
              <Text>{invoice.allocationNumber}</Text>
            </Group>
          </Paper>
        )}

        {/* Invoice document */}
        <Paper withBorder p="lg" radius="md">
          <Stack gap="md">
            {/* Customer section */}
            {invoice.customerName && (
              <>
                <Stack gap={2}>
                  <Text size="sm" fw={500}>
                    לכבוד:
                  </Text>
                  <Text>{invoice.customerName}</Text>
                  {invoice.customerTaxId && (
                    <Text size="sm" c="dimmed">
                      {invoice.customerTaxId}
                    </Text>
                  )}
                  {invoice.customerAddress && (
                    <Text size="sm" c="dimmed">
                      {invoice.customerAddress}
                    </Text>
                  )}
                  {invoice.customerEmail && (
                    <Text size="sm" c="dimmed">
                      {invoice.customerEmail}
                    </Text>
                  )}
                </Stack>
                <Divider />
              </>
            )}

            {/* Line items table */}
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>#</Table.Th>
                  <Table.Th>תיאור</Table.Th>
                  <Table.Th>כמות</Table.Th>
                  <Table.Th>מחיר יח׳</Table.Th>
                  <Table.Th>הנחה %</Table.Th>
                  <Table.Th>סה"כ</Table.Th>
                  <Table.Th>מע"מ</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items
                  .sort((a, b) => a.position - b.position)
                  .map((item, index) => (
                    <Table.Tr key={item.id}>
                      <Table.Td>{index + 1}</Table.Td>
                      <Table.Td>{item.description}</Table.Td>
                      <Table.Td>{item.quantity}</Table.Td>
                      <Table.Td>{formatMinorUnits(item.unitPriceMinorUnits)}</Table.Td>
                      <Table.Td>
                        {item.discountPercent > 0 ? `${item.discountPercent}%` : '—'}
                      </Table.Td>
                      <Table.Td>{formatMinorUnits(item.lineTotalMinorUnits)}</Table.Td>
                      <Table.Td>{formatMinorUnits(item.vatAmountMinorUnits)}</Table.Td>
                    </Table.Tr>
                  ))}
              </Table.Tbody>
            </Table>

            {/* Totals */}
            <Stack gap={4} maw={300} ms="auto">
              <TotalRow
                label="סה״כ לפני הנחה"
                value={formatMinorUnits(invoice.subtotalMinorUnits)}
              />
              {invoice.discountMinorUnits > 0 && (
                <TotalRow label="הנחה" value={formatMinorUnits(invoice.discountMinorUnits)} />
              )}
              <TotalRow
                label="סה״כ לפני מע״מ"
                value={formatMinorUnits(invoice.totalExclVatMinorUnits)}
              />
              <TotalRow label={vatLabel} value={formatMinorUnits(invoice.vatMinorUnits)} />
              <Group justify="space-between" mt="xs">
                <Text fw={700}>סה״כ לתשלום</Text>
                <Text fw={700}>{formatMinorUnits(invoice.totalInclVatMinorUnits)}</Text>
              </Group>
            </Stack>

            {/* VAT exemption reason */}
            {invoice.vatExemptionReason && (
              <>
                <Divider />
                <Text size="sm">
                  <Text span fw={500}>
                    סיבת פטור ממע"מ:{' '}
                  </Text>
                  {invoice.vatExemptionReason}
                </Text>
              </>
            )}

            {/* Notes */}
            {invoice.notes && (
              <>
                <Divider />
                <Text size="sm">
                  <Text span fw={500}>
                    הערות:{' '}
                  </Text>
                  {invoice.notes}
                </Text>
              </>
            )}
          </Stack>
        </Paper>

        {/* Audit timeline */}
        <Paper withBorder p="md" radius="md">
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              ציר זמן
            </Text>
            <Group gap="lg">
              <Text size="sm" c="dimmed">
                נוצרה: {formatDateTime(invoice.createdAt)}
              </Text>
              {invoice.issuedAt && (
                <Text size="sm" c="dimmed">
                  הופקה: {formatDateTime(invoice.issuedAt)}
                </Text>
              )}
              {invoice.sentAt && (
                <Text size="sm" c="dimmed">
                  נשלחה: {formatDateTime(invoice.sentAt)}
                </Text>
              )}
              {invoice.paidAt && (
                <Text size="sm" c="dimmed">
                  שולמה: {formatDateTime(invoice.paidAt)}
                </Text>
              )}
            </Group>
          </Stack>
        </Paper>
      </Stack>
    </Container>
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
