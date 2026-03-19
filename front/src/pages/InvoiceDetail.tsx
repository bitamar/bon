import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Container,
  Divider,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { DatePickerInput, type DateValue } from '@mantine/dates';
import {
  IconFileDownload,
  IconMail,
  IconCash,
  IconReceiptRefund,
  IconSettings,
  IconAlertTriangle,
  IconTrash,
} from '@tabler/icons-react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageTitle } from '../components/PageTitle';
import { StatusCard } from '../components/StatusCard';
import { InvoiceTotalsSummary } from '../components/InvoiceTotalsSummary';
import { InvoiceAnnotation } from '../components/InvoiceAnnotation';
import {
  fetchInvoice,
  sendInvoiceByEmail,
  recordPayment,
  deletePayment,
  createCreditNote,
  downloadInvoicePdf,
} from '../api/invoices';
import { queryKeys } from '../lib/queryKeys';
import { useApiMutation } from '../lib/useApiMutation';
import { useBusiness } from '../contexts/BusinessContext';
import { formatDate, formatMinorUnits } from '@bon/types/formatting';
import { DOCUMENT_TYPE_LABELS, type InvoiceStatus, type LineItemInput } from '@bon/types/invoices';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@bon/types/payments';
import { INVOICE_STATUS_CONFIG } from '../lib/invoiceStatus';
import { computeVatLabel } from '../lib/vatLabel';
import { ITA_ERROR_MAP, EMERGENCY_POOL_EMPTY_MESSAGE } from '@bon/types/shaam';

function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function detectErrorCode(allocationError: string | null): string | null {
  if (!allocationError) return null;
  if (allocationError === EMERGENCY_POOL_EMPTY_MESSAGE) return 'E099_EMPTY';
  if (allocationError === ITA_ERROR_MAP.E001.hebrewMessage) return 'E001';
  if (allocationError === ITA_ERROR_MAP.E010.hebrewMessage) return 'E010';
  if (allocationError.includes(ITA_ERROR_MAP.E099.hebrewMessage)) return 'E099';
  return null;
}

function AllocationRejectedBanner(props: Readonly<{ allocationError: string | null }>) {
  const navigate = useNavigate();
  const { activeBusiness } = useBusiness();
  const isOwner = activeBusiness?.role === 'owner';
  const errorCode = detectErrorCode(props.allocationError);

  // E010: orange, re-auth action
  if (errorCode === 'E010') {
    return (
      <Paper withBorder p="md" radius="md" bg="orange.0" data-testid="allocation-rejected-e010">
        <Group gap="sm" justify="space-between">
          <Group gap="sm">
            <IconAlertTriangle size={18} color="var(--mantine-color-orange-7)" />
            <Text fw={600}>{props.allocationError}</Text>
          </Group>
          {isOwner ? (
            <Button
              size="xs"
              variant="light"
              color="orange"
              leftSection={<IconSettings size={14} />}
              onClick={() => navigate('/settings')}
            >
              חבר מחדש
            </Button>
          ) : (
            <Button size="xs" variant="light" color="orange" disabled>
              פנה לבעל העסק
            </Button>
          )}
        </Group>
      </Paper>
    );
  }

  // E099 pool empty: red, go to settings
  if (errorCode === 'E099_EMPTY') {
    return (
      <Paper withBorder p="md" radius="md" bg="red.0" data-testid="allocation-rejected-e099-empty">
        <Group gap="sm" justify="space-between">
          <Group gap="sm">
            <IconAlertTriangle size={18} color="var(--mantine-color-red-7)" />
            <Text fw={600}>{props.allocationError}</Text>
          </Group>
          {isOwner ? (
            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<IconSettings size={14} />}
              onClick={() => navigate('/settings')}
            >
              הזן מספרי חירום
            </Button>
          ) : (
            <Button size="xs" variant="light" color="red" disabled>
              פנה לבעל העסק
            </Button>
          )}
        </Group>
      </Paper>
    );
  }

  // E001: red, go to settings
  if (errorCode === 'E001') {
    return (
      <Paper withBorder p="md" radius="md" bg="red.0" data-testid="allocation-rejected-e001">
        <Group gap="sm" justify="space-between">
          <Group gap="sm">
            <IconAlertTriangle size={18} color="var(--mantine-color-red-7)" />
            <Text fw={600}>{props.allocationError}</Text>
          </Group>
          {isOwner ? (
            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<IconSettings size={14} />}
              onClick={() => navigate('/settings')}
            >
              עבור להגדרות
            </Button>
          ) : (
            <Button size="xs" variant="light" color="red" disabled>
              פנה לבעל העסק
            </Button>
          )}
        </Group>
      </Paper>
    );
  }

  // Default rejected banner
  return (
    <Paper withBorder p="md" radius="md" bg="red.0" data-testid="allocation-rejected">
      <Stack gap={4}>
        <Group gap="sm">
          <Text fw={600}>הקצאת SHAAM נדחתה</Text>
        </Group>
        {props.allocationError && (
          <Text size="sm" c="red.7">
            {props.allocationError}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

const CREDIT_NOTE_ELIGIBLE: readonly InvoiceStatus[] = [
  'finalized',
  'sent',
  'paid',
  'partially_paid',
] as const;

const SENDABLE_STATUSES = new Set<InvoiceStatus>(['finalized', 'sent', 'partially_paid']);
const PAYABLE_STATUSES = new Set<InvoiceStatus>(['finalized', 'sent', 'partially_paid']);
const PAYMENT_DELETABLE_STATUSES = new Set<InvoiceStatus>([
  'finalized',
  'sent',
  'partially_paid',
  'paid',
]);

const PAYMENT_METHOD_OPTIONS = Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({
  value,
  label,
}));

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number | string>('');
  const [paymentDate, setPaymentDate] = useState<DateValue>(new Date());
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [creditNoteModalOpen, setCreditNoteModalOpen] = useState(false);
  const [creditNoteItems, setCreditNoteItems] = useState<LineItemInput[]>([]);

  const invoiceQuery = useQuery({
    queryKey: queryKeys.invoice(businessId, invoiceId),
    queryFn: () => fetchInvoice(businessId, invoiceId),
    enabled: !!businessId && !!invoiceId,
  });

  // ── helpers ──

  function invalidateInvoiceQueries() {
    queryClient.invalidateQueries({ queryKey: queryKeys.invoice(businessId, invoiceId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.invoices(businessId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(businessId) });
  }

  const sendMutation = useApiMutation({
    mutationFn: () =>
      sendInvoiceByEmail(businessId, invoiceId, {
        recipientEmail: recipientEmail?.trim() || undefined,
      }),
    successToast: { message: 'החשבונית נשלחת ברקע' },
    onSuccess: () => {
      setSendModalOpen(false);
      invalidateInvoiceQueries();
    },
  });

  const paymentMutation = useApiMutation({
    mutationFn: () => {
      const amountMinorUnits = Math.round(
        (typeof paymentAmount === 'number' ? paymentAmount : 0) * 100
      );
      return recordPayment(businessId, invoiceId, {
        amountMinorUnits,
        paidAt: toDateString(paymentDate instanceof Date ? paymentDate : new Date()),
        method: paymentMethod as PaymentMethod,
        reference: paymentReference.trim() || undefined,
        notes: paymentNotes.trim() || undefined,
      });
    },
    successToast: { message: 'התשלום נרשם בהצלחה' },
    onSuccess: () => {
      setPaymentModalOpen(false);
      invalidateInvoiceQueries();
    },
  });

  const deleteMutation = useApiMutation({
    mutationFn: (paymentId: string) => deletePayment(businessId, invoiceId, paymentId),
    successToast: { message: 'התשלום נמחק בהצלחה' },
    onSuccess: () => {
      setDeleteConfirmId(null);
      invalidateInvoiceQueries();
    },
  });

  const pdfMutation = useApiMutation({
    mutationFn: () => downloadInvoicePdf(businessId, invoiceId),
    successToast: { message: 'הקובץ הורד בהצלחה' },
  });

  const creditNoteMutation = useApiMutation({
    mutationFn: () =>
      createCreditNote(businessId, invoiceId, {
        items: creditNoteItems,
      }),
    successToast: { message: 'חשבונית זיכוי הופקה בהצלחה' },
    onSuccess: (data) => {
      setCreditNoteModalOpen(false);
      invalidateInvoiceQueries();
      navigate(`/businesses/${businessId}/invoices/${data.invoice.id}`);
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

  const {
    invoice,
    items,
    payments,
    remainingBalanceMinorUnits,
    creditedInvoiceDocumentNumber,
    creditNotes,
  } = invoiceQuery.data;

  // Draft invoices redirect to edit page
  if (invoice.status === 'draft') {
    return <Navigate to={`/businesses/${businessId}/invoices/${invoiceId}/edit`} replace />;
  }

  const statusConfig = INVOICE_STATUS_CONFIG[invoice.status];
  const documentTypeLabel = DOCUMENT_TYPE_LABELS[invoice.documentType] ?? invoice.documentType;
  const showCreditNote = CREDIT_NOTE_ELIGIBLE.includes(invoice.status);
  const canSend = SENDABLE_STATUSES.has(invoice.status);
  const canPay = PAYABLE_STATUSES.has(invoice.status);
  const vatLabel = computeVatLabel(items.map((i) => i.vatRateBasisPoints));
  const remainingDisplay = remainingBalanceMinorUnits / 100;

  function openSendModal() {
    setRecipientEmail(invoice.customerEmail ?? '');
    setSendModalOpen(true);
  }

  function openCreditNoteModal() {
    // Pre-fill with the original invoice's line items
    const prefilled: LineItemInput[] = items.map((item) => ({
      description: item.description,
      catalogNumber: item.catalogNumber ?? undefined,
      quantity: item.quantity,
      unitPriceMinorUnits: item.unitPriceMinorUnits,
      discountPercent: item.discountPercent,
      vatRateBasisPoints: item.vatRateBasisPoints,
      position: item.position,
    }));
    setCreditNoteItems(prefilled);
    setCreditNoteModalOpen(true);
  }

  function updateCreditNoteItem(
    index: number,
    field: 'quantity' | 'unitPriceMinorUnits',
    value: number
  ) {
    setCreditNoteItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  function removeCreditNoteItem(index: number) {
    setCreditNoteItems((prev) => prev.filter((_, i) => i !== index));
  }

  function openPaymentModal() {
    setPaymentAmount(remainingDisplay);
    setPaymentDate(new Date());
    setPaymentMethod(null);
    setPaymentReference('');
    setPaymentNotes('');
    setPaymentModalOpen(true);
  }

  const paymentAmountNum = typeof paymentAmount === 'number' ? paymentAmount : 0;
  const paymentAmountValid = paymentAmountNum > 0 && paymentAmountNum <= remainingDisplay;
  const canSubmitPayment = paymentAmountValid && paymentDate && paymentMethod;

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
              loading={pdfMutation.isPending}
              onClick={() => pdfMutation.mutate()}
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
              disabled={!canPay}
              onClick={openPaymentModal}
            >
              סמן כשולם
            </Button>
            {showCreditNote && invoice.documentType !== 'credit_note' && (
              <Button
                variant="light"
                leftSection={<IconReceiptRefund size={16} />}
                onClick={openCreditNoteModal}
              >
                הפק חשבונית זיכוי
              </Button>
            )}
          </Group>
        </Paper>

        {/* Credit note back-link: this is a credit note → link to original */}
        {invoice.documentType === 'credit_note' && invoice.creditedInvoiceId && (
          <Paper withBorder p="md" radius="md" bg="grape.0" data-testid="credit-note-source-link">
            <Group gap="sm">
              <IconReceiptRefund size={18} />
              <Text>
                חשבונית זיכוי עבור{' '}
                <Text
                  component={Link}
                  to={`/businesses/${businessId}/invoices/${invoice.creditedInvoiceId}`}
                  c="blue"
                  td="underline"
                  inherit
                >
                  {creditedInvoiceDocumentNumber ?? 'חשבונית מקורית'}
                </Text>
              </Text>
            </Group>
          </Paper>
        )}

        {/* Credited invoice back-link: this invoice was credited → link to credit notes */}
        {creditNotes && creditNotes.length > 0 && (
          <Paper withBorder p="md" radius="md" bg="grape.0" data-testid="credited-invoice-link">
            <Group gap="sm">
              <IconReceiptRefund size={18} />
              <Text>
                {'זוכתה בחשבונית זיכוי '}
                {creditNotes.map((cn, i) => (
                  <span key={cn.id}>
                    {i > 0 && ', '}
                    <Text
                      component={Link}
                      to={`/businesses/${businessId}/invoices/${cn.id}`}
                      c="blue"
                      td="underline"
                      inherit
                    >
                      {cn.documentNumber ?? 'חשבונית זיכוי'}
                    </Text>
                  </span>
                ))}
              </Text>
            </Group>
          </Paper>
        )}

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
        {invoice.allocationStatus === 'emergency' && invoice.allocationNumber && (
          <Paper withBorder p="md" radius="md" bg="orange.0" data-testid="allocation-emergency">
            <Group gap="sm">
              <Text fw={600}>מספר הקצאת חירום:</Text>
              <Text dir="ltr">{invoice.allocationNumber}</Text>
            </Group>
          </Paper>
        )}
        {invoice.allocationStatus === 'rejected' && (
          <AllocationRejectedBanner allocationError={invoice.allocationError} />
        )}

        {/* Remaining balance */}
        {remainingBalanceMinorUnits > 0 && (
          <Paper withBorder p="md" radius="md" data-testid="remaining-balance">
            <Group gap="sm">
              <Text fw={600}>יתרה לתשלום:</Text>
              <Text fw={700} c="red.7">
                {formatMinorUnits(remainingBalanceMinorUnits)}
              </Text>
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

        {/* Payment history */}
        <Paper withBorder p="md" radius="md" data-testid="payment-history">
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              היסטוריית תשלומים
            </Text>
            {payments.length === 0 ? (
              <Text size="sm" c="dimmed" data-testid="no-payments">
                לא נרשמו תשלומים
              </Text>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>תאריך</Table.Th>
                    <Table.Th>סכום</Table.Th>
                    <Table.Th>אמצעי תשלום</Table.Th>
                    <Table.Th>אסמכתא</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {payments.map((p) => (
                    <Table.Tr key={p.id} data-testid="payment-row">
                      <Table.Td>{formatDate(p.paidAt)}</Table.Td>
                      <Table.Td>{formatMinorUnits(p.amountMinorUnits)}</Table.Td>
                      <Table.Td>{PAYMENT_METHOD_LABELS[p.method]}</Table.Td>
                      <Table.Td>{p.reference ?? '—'}</Table.Td>
                      {PAYMENT_DELETABLE_STATUSES.has(invoice.status) && (
                        <Table.Td>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="sm"
                            onClick={() => setDeleteConfirmId(p.id)}
                            data-testid={`delete-payment-${p.id}`}
                            aria-label={`מחק תשלום ${p.id}`}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Table.Td>
                      )}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
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

      {/* Payment modal */}
      <Modal
        opened={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        title="רישום תשלום"
        centered
        data-testid="payment-modal"
      >
        <Stack gap="md">
          <NumberInput
            label="סכום"
            prefix="₪"
            decimalScale={2}
            fixedDecimalScale
            min={0.01}
            max={remainingDisplay}
            value={paymentAmount}
            onChange={setPaymentAmount}
            data-testid="payment-amount-input"
            error={
              typeof paymentAmount === 'number' && paymentAmount > remainingDisplay
                ? 'הסכום חורג מהיתרה לתשלום'
                : undefined
            }
          />
          <DatePickerInput
            label="תאריך תשלום"
            value={paymentDate}
            onChange={setPaymentDate}
            data-testid="payment-date-input"
          />
          <Select
            label="אמצעי תשלום"
            data={PAYMENT_METHOD_OPTIONS}
            value={paymentMethod}
            onChange={setPaymentMethod}
            data-testid="payment-method-input"
          />
          <TextInput
            label="אסמכתא"
            placeholder="מספר שיק, אסמכתא להעברה..."
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.currentTarget.value)}
            data-testid="payment-reference-input"
          />
          <Textarea
            label="הערות"
            value={paymentNotes}
            onChange={(e) => setPaymentNotes(e.currentTarget.value)}
            data-testid="payment-notes-input"
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setPaymentModalOpen(false)}>
              ביטול
            </Button>
            <Button
              onClick={() => paymentMutation.mutate()}
              loading={paymentMutation.isPending}
              disabled={!canSubmitPayment}
              data-testid="payment-submit"
            >
              רשום תשלום
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Delete payment confirmation modal */}
      <Modal
        opened={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title="מחיקת תשלום"
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text>האם למחוק את התשלום? פעולה זו תעדכן את סטטוס החשבונית.</Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setDeleteConfirmId(null)}>
              ביטול
            </Button>
            <Button
              color="red"
              onClick={() => {
                if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId);
              }}
              loading={deleteMutation.isPending}
              data-testid="confirm-delete-payment"
            >
              מחק
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Credit note modal */}
      <Modal
        opened={creditNoteModalOpen}
        onClose={() => setCreditNoteModalOpen(false)}
        title="הפקת חשבונית זיכוי"
        centered
        size="lg"
        data-testid="credit-note-modal"
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            ערוך את הפריטים לזיכוי. להסרת פריט לחץ על כפתור המחיקה. לזיכוי חלקי — עדכן כמות או מחיר.
          </Text>
          {creditNoteItems.length === 0 ? (
            <Text size="sm" c="red" data-testid="credit-note-empty">
              לא נבחרו פריטים לזיכוי
            </Text>
          ) : (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>תיאור</Table.Th>
                  <Table.Th>כמות</Table.Th>
                  <Table.Th>מחיר יח׳ (אג׳)</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {creditNoteItems.map((item, index) => (
                  <Table.Tr key={item.position} data-testid="credit-note-item-row">
                    <Table.Td>{item.description}</Table.Td>
                    <Table.Td>
                      <NumberInput
                        size="xs"
                        min={0.01}
                        decimalScale={2}
                        value={item.quantity}
                        onChange={(v) =>
                          updateCreditNoteItem(index, 'quantity', typeof v === 'number' ? v : 0)
                        }
                        data-testid={`credit-note-quantity-${index}`}
                        style={{ width: 80 }}
                      />
                    </Table.Td>
                    <Table.Td>
                      <NumberInput
                        size="xs"
                        min={0}
                        allowDecimal={false}
                        value={item.unitPriceMinorUnits}
                        onChange={(v) =>
                          updateCreditNoteItem(
                            index,
                            'unitPriceMinorUnits',
                            typeof v === 'number' ? v : 0
                          )
                        }
                        data-testid={`credit-note-price-${index}`}
                        style={{ width: 100 }}
                      />
                    </Table.Td>
                    <Table.Td>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="sm"
                        onClick={() => removeCreditNoteItem(index)}
                        data-testid={`credit-note-remove-${index}`}
                        aria-label={`הסר ${item.description}`}
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setCreditNoteModalOpen(false)}>
              ביטול
            </Button>
            <Button
              onClick={() => creditNoteMutation.mutate()}
              loading={creditNoteMutation.isPending}
              disabled={creditNoteItems.length === 0}
              data-testid="credit-note-submit"
            >
              הפק חשבונית זיכוי
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
