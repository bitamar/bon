import { useState } from 'react';
import {
  Badge,
  Button,
  Container,
  Divider,
  Group,
  Modal,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconFileDownload, IconMail, IconCash, IconReceiptRefund } from '@tabler/icons-react';
import { Navigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageTitle } from '../components/PageTitle';
import { StatusCard } from '../components/StatusCard';
import { InvoiceTotalsSummary } from '../components/InvoiceTotalsSummary';
import { InvoiceAnnotation } from '../components/InvoiceAnnotation';
import { fetchInvoice, sendInvoiceByEmail } from '../api/invoices';
import { queryKeys } from '../lib/queryKeys';
import { useApiMutation } from '../lib/useApiMutation';
import { useBusiness } from '../contexts/BusinessContext';
import { formatDate, formatMinorUnits } from '@bon/types/formatting';
import { DOCUMENT_TYPE_LABELS, type InvoiceStatus } from '@bon/types/invoices';
import { INVOICE_STATUS_CONFIG } from '../lib/invoiceStatus';
import { computeVatLabel } from '../lib/vatLabel';

function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

const CREDIT_NOTE_ELIGIBLE: readonly InvoiceStatus[] = [
  'finalized',
  'sent',
  'paid',
  'partially_paid',
] as const;

const SENDABLE_STATUSES = new Set<InvoiceStatus>(['finalized', 'sent']);

function DetailSkeleton() {
  return (
    <Container size="lg" pt={{ base: 'xl', sm: 'xl' }} pb="xl" data-testid="invoice-loading">
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
  const { businessId = '', invoiceId = '' } = useParams<{
    businessId: string;
    invoiceId: string;
  }>();
  const { activeBusiness } = useBusiness();
  const queryClient = useQueryClient();

  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');

  const invoiceQuery = useQuery({
    queryKey: queryKeys.invoice(businessId, invoiceId),
    queryFn: () => fetchInvoice(businessId, invoiceId),
    enabled: !!businessId && !!invoiceId,
  });

  const sendMutation = useApiMutation({
    mutationFn: () =>
      sendInvoiceByEmail(businessId, invoiceId, {
        recipientEmail: recipientEmail?.trim() || undefined,
      }),
    successToast: { message: 'החשבונית נשלחה בהצלחה' },
    onSuccess: () => {
      setSendModalOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.invoice(businessId, invoiceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices(businessId) });
    },
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
    return <Navigate to={`/businesses/${businessId}/invoices/${invoiceId}/edit`} replace />;
  }

  const statusConfig = INVOICE_STATUS_CONFIG[invoice.status];
  const documentTypeLabel = DOCUMENT_TYPE_LABELS[invoice.documentType] ?? invoice.documentType;
  const showCreditNote = CREDIT_NOTE_ELIGIBLE.includes(invoice.status);
  const canSend = SENDABLE_STATUSES.has(invoice.status);
  const vatLabel = computeVatLabel(items.map((i) => i.vatRateBasisPoints));

  function openSendModal() {
    setRecipientEmail(invoice.customerEmail ?? '');
    setSendModalOpen(true);
  }

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
              <Text size="sm">תאריך: {formatDate(invoice.invoiceDate)}</Text>
              {invoice.issuedAt && (
                <Text size="sm" c="dimmed">
                  הופקה: {formatDateTime(invoice.issuedAt)}
                </Text>
              )}
              {invoice.dueDate && (
                <Text size="sm" c="dimmed">
                  תאריך תשלום: {formatDate(invoice.dueDate)}
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
              disabled={!canSend}
              title={canSend ? 'שלח חשבונית במייל' : 'יהיה זמין בקרוב'}
              onClick={openSendModal}
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

        {/* SHAAM allocation status */}
        {invoice.allocationStatus === 'approved' && invoice.allocationNumber && (
          <Paper withBorder p="md" radius="md" bg="blue.0" data-testid="allocation-approved">
            <Group gap="sm">
              <Text fw={600}>מספר הקצאה:</Text>
              <Text dir="ltr">{invoice.allocationNumber}</Text>
            </Group>
          </Paper>
        )}
        {invoice.allocationStatus === 'pending' && (
          <Paper withBorder p="md" radius="md" bg="yellow.0" data-testid="allocation-pending">
            <Group gap="sm">
              <Text fw={600}>סטטוס הקצאה:</Text>
              <Text>ממתין לאישור SHAAM</Text>
            </Group>
          </Paper>
        )}
        {invoice.allocationStatus === 'rejected' && (
          <Paper withBorder p="md" radius="md" bg="red.0" data-testid="allocation-rejected">
            <Stack gap={4}>
              <Group gap="sm">
                <Text fw={600}>הקצאת SHAAM נדחתה</Text>
              </Group>
              {invoice.allocationError && (
                <Text size="sm" c="red.7">
                  {invoice.allocationError}
                </Text>
              )}
            </Stack>
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
                {[...items]
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
            <InvoiceTotalsSummary
              subtotalMinorUnits={invoice.subtotalMinorUnits}
              discountMinorUnits={invoice.discountMinorUnits}
              totalExclVatMinorUnits={invoice.totalExclVatMinorUnits}
              vatMinorUnits={invoice.vatMinorUnits}
              totalInclVatMinorUnits={invoice.totalInclVatMinorUnits}
              vatLabel={vatLabel}
            />

            {/* VAT exemption reason */}
            {invoice.vatExemptionReason && (
              <InvoiceAnnotation label='סיבת פטור ממע"מ' value={invoice.vatExemptionReason} />
            )}

            {/* Notes */}
            {invoice.notes && <InvoiceAnnotation label="הערות" value={invoice.notes} />}
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

      {/* Send email modal */}
      <Modal
        opened={sendModalOpen}
        onClose={() => setSendModalOpen(false)}
        title="שליחת חשבונית במייל"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="כתובת מייל"
            placeholder="email@example.com"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.currentTarget.value)}
            type="email"
            dir="ltr"
            data-testid="send-email-input"
          />
          <Text size="sm" c="dimmed">
            החשבונית תישלח כקובץ PDF מצורף.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setSendModalOpen(false)}>
              ביטול
            </Button>
            <Button
              onClick={() => sendMutation.mutate()}
              loading={sendMutation.isPending}
              disabled={!recipientEmail?.trim()}
            >
              שלח
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
