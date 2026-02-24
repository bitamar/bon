import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Container,
  Divider,
  Group,
  Modal,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { DatePickerInput, type DateValue } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageTitle } from '../components/PageTitle';
import { StatusCard } from '../components/StatusCard';
import { CustomerSelect } from '../components/CustomerSelect';
import { InvoiceLineItems, type LineItemFormRow } from '../components/InvoiceLineItems';
import { InvoiceTotals } from '../components/InvoiceTotals';
import { useApiMutation } from '../lib/useApiMutation';
import { deleteInvoiceDraft, fetchInvoice, updateInvoiceDraft } from '../api/invoices';
import { fetchBusiness } from '../api/businesses';
import { queryKeys } from '../lib/queryKeys';
import { useBusiness } from '../contexts/BusinessContext';
import { formatAgora } from '../lib/format';
import { showErrorNotification } from '../lib/notifications';
import { calculateInvoiceTotals } from '@bon/types/vat';
import type { DocumentType, UpdateInvoiceDraftBody } from '@bon/types/invoices';

const DOC_TYPE_OPTIONS = [
  { value: 'tax_invoice', label: 'חשבונית מס' },
  { value: 'tax_invoice_receipt', label: 'חשבונית מס קבלה' },
  { value: 'receipt', label: 'קבלה' },
];

const DOC_TYPE_DESCRIPTIONS: Record<string, string> = {
  tax_invoice: 'מסמך חיוב ללא אישור תשלום',
  tax_invoice_receipt: 'מסמך חיוב הכולל אישור תשלום',
  receipt: 'אישור תשלום בלבד — ללא מע״מ',
};

interface InvoiceFormValues {
  documentType: DocumentType;
  customerId: string | null;
  invoiceDate: Date | null;
  dueDate: Date | null;
  notes: string;
  internalNotes: string;
  items: LineItemFormRow[];
}

function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDateOrNull(val: DateValue): Date | null {
  if (val === null) return null;
  if (val instanceof Date) return val;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function makeEmptyRow(defaultVatRate: number): LineItemFormRow {
  return {
    key: crypto.randomUUID(),
    description: '',
    catalogNumber: '',
    quantity: 1,
    unitPriceShekel: 0,
    discountPercent: 0,
    vatRateBasisPoints: defaultVatRate,
  };
}

export function InvoiceEdit() {
  const { invoiceId = '' } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeBusiness } = useBusiness();
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure(false);

  const businessId = activeBusiness?.id ?? '';

  const invoiceQuery = useQuery({
    queryKey: queryKeys.invoice(businessId, invoiceId),
    queryFn: () => fetchInvoice(businessId, invoiceId),
    enabled: !!activeBusiness && !!invoiceId,
  });

  const businessQuery = useQuery({
    queryKey: queryKeys.business(businessId),
    queryFn: () => fetchBusiness(businessId),
    enabled: !!activeBusiness,
  });

  const defaultVatRate = businessQuery.data?.business.defaultVatRate ?? 1700;
  const businessType = businessQuery.data?.business.businessType;

  const initialValues = useMemo((): InvoiceFormValues | null => {
    if (!invoiceQuery.data) return null;
    const { invoice, items } = invoiceQuery.data;
    return {
      documentType: invoice.documentType as DocumentType,
      customerId: invoice.customerId,
      invoiceDate: parseDate(invoice.invoiceDate),
      dueDate: parseDate(invoice.dueDate),
      notes: invoice.notes ?? '',
      internalNotes: invoice.internalNotes ?? '',
      items:
        items.length > 0
          ? items
              .sort((a, b) => a.position - b.position)
              .map((it) => ({
                key: it.id,
                description: it.description,
                catalogNumber: it.catalogNumber ?? '',
                quantity: it.quantity,
                unitPriceShekel: it.unitPriceAgora / 100,
                discountPercent: it.discountPercent,
                vatRateBasisPoints: it.vatRateBasisPoints,
              }))
          : [makeEmptyRow(defaultVatRate)],
    };
  }, [invoiceQuery.data, defaultVatRate]);

  const [form, setForm] = useState<InvoiceFormValues | null>(null);

  useEffect(() => {
    if (initialValues && !form) {
      setForm(initialValues);
    }
  }, [initialValues, form]);

  // VAT lock logic
  const vatLocked = form?.documentType === 'receipt' || businessType === 'exempt_dealer';

  useEffect(() => {
    if (vatLocked && form) {
      const needsUpdate = form.items.some((item) => item.vatRateBasisPoints !== 0);
      if (needsUpdate) {
        setForm({
          ...form,
          items: form.items.map((item) => ({ ...item, vatRateBasisPoints: 0 })),
        });
      }
    }
  }, [vatLocked, form]);

  const saveMutation = useApiMutation({
    mutationFn: (data: UpdateInvoiceDraftBody) => updateInvoiceDraft(businessId, invoiceId, data),
    successToast: { message: 'הטיוטה נשמרה בהצלחה' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoice(businessId, invoiceId) });
    },
  });

  const deleteMutation = useApiMutation({
    mutationFn: () => deleteInvoiceDraft(businessId, invoiceId),
    successToast: { message: 'הטיוטה נמחקה' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices(businessId) });
      closeDelete();
      navigate('/');
    },
  });

  // ── Guards ──

  if (!activeBusiness) {
    return (
      <Container size="md" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard status="error" title="לא נבחר עסק" description="אנא בחר עסק מהתפריט העליון" />
      </Container>
    );
  }

  if (invoiceQuery.isPending || businessQuery.isPending) {
    return (
      <Container size="md" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard status="loading" title="טוען חשבונית..." />
      </Container>
    );
  }

  if (invoiceQuery.error || businessQuery.error) {
    return (
      <Container size="md" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard
          status="error"
          title="לא הצלחנו לטעון את החשבונית"
          primaryAction={{
            label: 'נסה שוב',
            onClick: () => {
              invoiceQuery.refetch();
              businessQuery.refetch();
            },
          }}
        />
      </Container>
    );
  }

  const invoice = invoiceQuery.data.invoice;

  if (invoice.status !== 'draft') {
    return (
      <Container size="md" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <Alert
          color="yellow"
          icon={<IconAlertTriangle size={18} />}
          title="חשבונית זו כבר הופקה ואינה ניתנת לעריכה"
        />
      </Container>
    );
  }

  if (!form) {
    return (
      <Container size="md" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard status="loading" title="טוען חשבונית..." />
      </Container>
    );
  }

  // ── Save logic ──

  function handleSave() {
    if (!form) return;

    const nonEmptyItems = form.items.filter(
      (item) => item.description.trim() !== '' || item.unitPriceShekel !== 0
    );

    const hasPartialRows = nonEmptyItems.some(
      (item) => item.description.trim() === '' && item.unitPriceShekel !== 0
    );

    if (hasPartialRows) {
      showErrorNotification('יש שורות ללא תיאור — נא להוסיף תיאור לכל שורה עם מחיר');
      return;
    }

    const payload: UpdateInvoiceDraftBody = {
      documentType: form.documentType,
      customerId: form.customerId ?? null,
      invoiceDate: form.invoiceDate ? toLocalDateString(form.invoiceDate) : null,
      dueDate: form.dueDate ? toLocalDateString(form.dueDate) : null,
      notes: form.notes || null,
      internalNotes: form.internalNotes || null,
      items: nonEmptyItems.map((item, index) => ({
        description: item.description,
        catalogNumber: item.catalogNumber || undefined,
        quantity: item.quantity,
        unitPriceAgora: Math.round(item.unitPriceShekel * 100),
        discountPercent: item.discountPercent,
        vatRateBasisPoints: item.vatRateBasisPoints,
        position: index,
      })),
    };

    saveMutation.mutate(payload);
  }

  // ── Totals for header ──

  const headerTotals = calculateInvoiceTotals(
    form.items.map((row) => ({
      quantity: row.quantity,
      unitPriceAgora: Math.round(row.unitPriceShekel * 100),
      discountPercent: row.discountPercent,
      vatRateBasisPoints: row.vatRateBasisPoints,
    }))
  );

  return (
    <>
      <Container size="md" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Group gap="sm">
              <PageTitle order={3}>עריכת חשבונית</PageTitle>
              <Badge color="gray" variant="light">
                טיוטה
              </Badge>
            </Group>
            <Group gap="sm">
              <Text size="lg" fw={600}>
                {formatAgora(headerTotals.totalInclVatAgora)}
              </Text>
              {invoice.fullNumber ? null : (
                <Text size="sm" c="dimmed">
                  מספר יוקצה בהפקה
                </Text>
              )}
            </Group>
          </Group>

          <Paper withBorder radius="lg" p="lg">
            <Stack gap="md">
              <Stack gap={4}>
                <SegmentedControl
                  data={DOC_TYPE_OPTIONS}
                  value={form.documentType}
                  onChange={(val) => setForm({ ...form, documentType: val as DocumentType })}
                  fullWidth
                />
                <Text size="xs" c="dimmed">
                  {DOC_TYPE_DESCRIPTIONS[form.documentType]}
                </Text>
              </Stack>

              <CustomerSelect
                businessId={businessId}
                value={form.customerId}
                onChange={(val) => setForm({ ...form, customerId: val })}
              />

              <Group grow>
                <DatePickerInput
                  label="תאריך חשבונית"
                  value={form.invoiceDate}
                  onChange={(val) => setForm({ ...form, invoiceDate: toDateOrNull(val) })}
                  clearable
                />
                <DatePickerInput
                  label="תאריך תשלום"
                  value={form.dueDate}
                  onChange={(val) => setForm({ ...form, dueDate: toDateOrNull(val) })}
                  clearable
                />
              </Group>

              <Divider label="פריטים" labelPosition="center" />

              <InvoiceLineItems
                items={form.items}
                onChange={(items) => setForm({ ...form, items })}
                vatLocked={vatLocked}
                defaultVatRate={defaultVatRate}
              />

              <InvoiceTotals items={form.items} />

              <Divider label="הערות" labelPosition="center" />

              <Textarea
                label="הערות ללקוח"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })}
                autosize
                minRows={2}
              />

              <Textarea
                label="הערות פנימיות"
                value={form.internalNotes}
                onChange={(e) => setForm({ ...form, internalNotes: e.currentTarget.value })}
                autosize
                minRows={2}
                styles={{ input: { backgroundColor: 'var(--mantine-color-gray-0)' } }}
              />
            </Stack>
          </Paper>

          <Group justify="space-between">
            <Button variant="subtle" color="red" onClick={openDelete}>
              מחק טיוטה
            </Button>
            <Button onClick={handleSave} loading={saveMutation.isPending}>
              שמור טיוטה
            </Button>
          </Group>
        </Stack>
      </Container>

      <Modal
        opened={deleteOpened}
        onClose={closeDelete}
        title="מחיקת טיוטה"
        centered
        overlayProps={{ blur: 2 }}
      >
        <Stack gap="md">
          <Text>האם למחוק את הטיוטה? פעולה זו אינה ניתנת לביטול.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeDelete} disabled={deleteMutation.isPending}>
              ביטול
            </Button>
            <Button
              color="red"
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              מחק
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
