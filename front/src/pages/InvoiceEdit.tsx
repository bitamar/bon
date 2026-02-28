import { useEffect, useMemo, useRef } from 'react';
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
import { useForm } from '@mantine/form';
import { useDebouncedCallback, useDisclosure } from '@mantine/hooks';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageTitle } from '../components/PageTitle';
import { StatusCard } from '../components/StatusCard';
import { CustomerSelect } from '../components/CustomerSelect';
import { InvoiceLineItems, type LineItemFormRow } from '../components/InvoiceLineItems';
import { InvoiceTotals } from '../components/InvoiceTotals';
import { BusinessProfileGateModal } from '../components/BusinessProfileGateModal';
import { VatExemptionReasonModal } from '../components/VatExemptionReasonModal';
import { InvoicePreviewModal } from '../components/InvoicePreviewModal';
import { SaveIndicator, type SaveStatus } from '../components/SaveIndicator';
import { useFinalizationFlow } from '../hooks/useFinalizationFlow';
import { useApiMutation } from '../lib/useApiMutation';
import { deleteInvoiceDraft, fetchInvoice, updateInvoiceDraft } from '../api/invoices';
import { fetchBusiness } from '../api/businesses';
import { fetchCustomer } from '../api/customers';
import { queryKeys } from '../lib/queryKeys';
import { useBusiness } from '../contexts/BusinessContext';
import { formatMinorUnits, fromMinorUnits, toMinorUnits } from '@bon/types/formatting';
import { showErrorNotification, showSuccessNotification } from '../lib/notifications';
import { calculateInvoiceTotals } from '@bon/types/vat';
import type { DocumentType, UpdateInvoiceDraftBody } from '@bon/types/invoices';

const DOC_TYPE_OPTIONS: { value: DocumentType; label: string }[] = [
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
  return val instanceof Date ? val : null;
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
    unitPrice: 0,
    discountPercent: 0,
    vatRateBasisPoints: defaultVatRate,
  };
}

function buildPayload(values: InvoiceFormValues): UpdateInvoiceDraftBody | null {
  const nonEmptyItems = values.items.filter(
    (item) => item.description.trim() !== '' || item.unitPrice !== 0
  );

  const hasPartialRows = nonEmptyItems.some(
    (item) => item.description.trim() === '' && item.unitPrice !== 0
  );

  if (hasPartialRows) return null;

  return {
    documentType: values.documentType,
    customerId: values.customerId ?? null,
    invoiceDate: values.invoiceDate ? toLocalDateString(values.invoiceDate) : undefined,
    dueDate: values.dueDate ? toLocalDateString(values.dueDate) : null,
    notes: values.notes || null,
    internalNotes: values.internalNotes || null,
    items: nonEmptyItems.map((item, index) => ({
      description: item.description,
      catalogNumber: item.catalogNumber || undefined,
      quantity: item.quantity,
      unitPriceMinorUnits: toMinorUnits(item.unitPrice),
      discountPercent: item.discountPercent,
      vatRateBasisPoints: item.vatRateBasisPoints,
      position: index,
    })),
  };
}

export function InvoiceEdit() {
  const { businessId = '', invoiceId = '' } = useParams<{
    businessId: string;
    invoiceId: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeBusiness } = useBusiness();
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure(false);

  const invoiceQuery = useQuery({
    queryKey: queryKeys.invoice(businessId, invoiceId),
    queryFn: () => fetchInvoice(businessId, invoiceId),
    enabled: !!businessId && !!invoiceId,
  });

  const businessQuery = useQuery({
    queryKey: queryKeys.business(businessId),
    queryFn: () => fetchBusiness(businessId),
    enabled: !!businessId,
  });

  const defaultVatRate = businessQuery.data?.business.defaultVatRate ?? 1700;
  const businessType = businessQuery.data?.business.businessType;

  // ── Form (useForm from @mantine/form) ──

  const form = useForm<InvoiceFormValues>({
    initialValues: {
      documentType: 'tax_invoice',
      customerId: null,
      invoiceDate: null,
      dueDate: null,
      notes: '',
      internalNotes: '',
      items: [makeEmptyRow(1700)],
    },
    validate: {
      items: {
        description: (value, values, path) => {
          const index = Number(path.split('.')[1]);
          const item = values.items[index];
          return item && item.unitPrice > 0 && !value.trim() ? 'נדרש תיאור' : null;
        },
      },
    },
  });

  // ── Hydration guard ──

  const hasHydrated = useRef(false);
  const savedValuesRef = useRef<InvoiceFormValues | null>(null);

  useEffect(() => {
    if (invoiceQuery.data && !hasHydrated.current) {
      const { invoice, items } = invoiceQuery.data;
      const serverValues: InvoiceFormValues = {
        documentType: invoice.documentType,
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
                  unitPrice: fromMinorUnits(it.unitPriceMinorUnits),
                  discountPercent: it.discountPercent,
                  vatRateBasisPoints: it.vatRateBasisPoints,
                }))
            : [makeEmptyRow(defaultVatRate)],
      };
      form.setValues(serverValues);
      form.resetDirty();
      hasHydrated.current = true;
    }
  }, [invoiceQuery.data, defaultVatRate]);

  // ── VAT lock logic ──

  const vatLocked = form.values.documentType === 'receipt' || businessType === 'exempt_dealer';

  useEffect(() => {
    if (vatLocked && hasHydrated.current) {
      const needsUpdate = form.values.items.some((item) => item.vatRateBasisPoints !== 0);
      if (needsUpdate) {
        form.setFieldValue(
          'items',
          form.values.items.map((item) => ({ ...item, vatRateBasisPoints: 0 }))
        );
      }
    }
  }, [vatLocked, form]);

  // ── Totals ──

  const headerTotals = useMemo(() => {
    return calculateInvoiceTotals(
      form.values.items.map((row) => ({
        quantity: row.quantity,
        unitPriceMinorUnits: toMinorUnits(row.unitPrice),
        discountPercent: row.discountPercent,
        vatRateBasisPoints: row.vatRateBasisPoints,
      }))
    );
  }, [form.values.items]);

  // ── Fetch selected customer info for preview ──

  const customerQuery = useQuery({
    queryKey: queryKeys.customer(businessId, form.values.customerId ?? ''),
    queryFn: () => fetchCustomer(businessId, form.values.customerId ?? ''),
    enabled: !!businessId && !!form.values.customerId,
  });

  // ── Finalization flow ──

  const finalization = useFinalizationFlow({
    businessId,
    invoiceId,
    business: businessQuery.data?.business ?? null,
    businessType,
    customerId: form.values.customerId ?? null,
    items: form.values.items,
    invoiceDate: form.values.invoiceDate ?? null,
    totalVatMinorUnits: headerTotals.vatMinorUnits,
  });

  // ── Save mutation (shared by manual save and autosave) ──

  const saveMutation = useApiMutation({
    mutationFn: (data: UpdateInvoiceDraftBody) => updateInvoiceDraft(businessId, invoiceId, data),
    successToast: false,
    onSuccess: () => {
      if (savedValuesRef.current) {
        form.resetDirty(savedValuesRef.current);
        savedValuesRef.current = null;
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.invoice(businessId, invoiceId) });
    },
  });

  // ── Autosave (debounced 2s, only after hydration) ──

  const debouncedSave = useDebouncedCallback(() => {
    if (saveMutation.isPending) return;
    if (form.isDirty()) {
      const payload = buildPayload(form.values);
      if (payload) {
        savedValuesRef.current = structuredClone(form.values);
        saveMutation.mutate(payload);
      }
    }
  }, 2000);

  useEffect(() => {
    if (hasHydrated.current && form.isDirty()) {
      debouncedSave();
    }
  }, [form.values, debouncedSave]);

  // ── beforeunload ──

  const isDirty = form.isDirty();
  const isSaving = saveMutation.isPending;

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty && !isSaving) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, isSaving]);

  // ── Delete mutation ──

  const deleteMutation = useApiMutation({
    mutationFn: () => deleteInvoiceDraft(businessId, invoiceId),
    successToast: { message: 'הטיוטה נמחקה' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices(businessId) });
      closeDelete();
      navigate(`/businesses/${businessId}/dashboard`);
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
    return <Navigate to={`/businesses/${businessId}/invoices/${invoiceId}`} replace />;
  }

  if (!hasHydrated.current) {
    return (
      <Container size="md" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard status="loading" title="טוען חשבונית..." />
      </Container>
    );
  }

  // ── Save logic ──

  function handleSave() {
    const payload = buildPayload(form.values);
    if (!payload) {
      showErrorNotification('יש שורות ללא תיאור — נא להוסיף תיאור לכל שורה עם מחיר');
      return;
    }
    savedValuesRef.current = form.values;
    saveMutation.mutate(payload, {
      onSuccess: () => showSuccessNotification('הטיוטה נשמרה בהצלחה'),
    });
  }

  async function handleFinalize() {
    const payload = buildPayload(form.values);
    if (!payload) {
      showErrorNotification('יש שורות ללא תיאור — נא להוסיף תיאור לכל שורה עם מחיר');
      return;
    }
    try {
      savedValuesRef.current = form.values;
      await saveMutation.mutateAsync(payload);
      finalization.startFinalization();
    } catch {
      // Error toast already shown by useApiMutation
    }
  }

  // ── Save indicator status ──

  let saveStatus: SaveStatus = 'saved';
  if (saveMutation.isPending) saveStatus = 'saving';
  else if (form.isDirty()) saveStatus = 'unsaved';

  // ── Customer info for preview ──

  const customerInfo = customerQuery.data
    ? {
        name: customerQuery.data.customer.name,
        taxId: customerQuery.data.customer.taxId,
        city: customerQuery.data.customer.city,
      }
    : null;

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
              <SaveIndicator status={saveStatus} />
              <Text size="lg" fw={600}>
                {formatMinorUnits(headerTotals.totalInclVatMinorUnits)}
              </Text>
              {invoice.documentNumber === null && (
                <Text size="sm" c="dimmed">
                  מספר יוקצה בהפקה
                </Text>
              )}
            </Group>
          </Group>

          {finalization.validationErrors.length > 0 && (
            <Alert color="red" icon={<IconAlertTriangle size={18} />} title="לא ניתן להפיק חשבונית">
              <Stack gap={4}>
                {finalization.validationErrors.map((err) => (
                  <Text key={err} size="sm">
                    {err}
                  </Text>
                ))}
              </Stack>
            </Alert>
          )}

          <Paper withBorder radius="lg" p="lg">
            <Stack gap="md">
              <Stack gap={4}>
                <SegmentedControl
                  data={DOC_TYPE_OPTIONS}
                  value={form.values.documentType}
                  onChange={(val) => {
                    if (DOC_TYPE_OPTIONS.some((o) => o.value === val)) {
                      form.setFieldValue('documentType', val as DocumentType);
                    }
                  }}
                  fullWidth
                />
                <Text size="xs" c="dimmed">
                  {DOC_TYPE_DESCRIPTIONS[form.values.documentType]}
                </Text>
              </Stack>

              <CustomerSelect
                businessId={businessId}
                value={form.values.customerId}
                onChange={(val) => form.setFieldValue('customerId', val)}
              />

              <Group grow>
                <DatePickerInput
                  label="תאריך חשבונית"
                  value={form.values.invoiceDate}
                  onChange={(val) => form.setFieldValue('invoiceDate', toDateOrNull(val))}
                />
                <DatePickerInput
                  label="תאריך תשלום"
                  value={form.values.dueDate}
                  onChange={(val) => form.setFieldValue('dueDate', toDateOrNull(val))}
                  clearable
                />
              </Group>

              <Divider label="פריטים" labelPosition="center" />

              <InvoiceLineItems
                items={form.values.items}
                onChange={(items) => form.setFieldValue('items', items)}
                vatLocked={vatLocked}
                defaultVatRate={defaultVatRate}
              />

              <InvoiceTotals items={form.values.items} />

              <Divider label="הערות" labelPosition="center" />

              <Textarea
                label="הערות ללקוח"
                value={form.values.notes}
                onChange={(e) => form.setFieldValue('notes', e.currentTarget.value)}
                autosize
                minRows={2}
              />

              <Textarea
                label="הערות פנימיות"
                value={form.values.internalNotes}
                onChange={(e) => form.setFieldValue('internalNotes', e.currentTarget.value)}
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
            <Group gap="sm">
              <Button variant="default" onClick={handleSave} loading={saveMutation.isPending}>
                שמור טיוטה
              </Button>
              <Button onClick={handleFinalize} loading={saveMutation.isPending}>
                הפק חשבונית
              </Button>
            </Group>
          </Group>
        </Stack>
      </Container>

      {/* Delete confirmation modal */}
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

      {/* Finalization flow modals */}
      {businessQuery.data && (
        <BusinessProfileGateModal
          opened={finalization.step === 'profile_gate'}
          onClose={finalization.closeModal}
          onSaved={finalization.onProfileSaved}
          business={businessQuery.data.business}
          businessType={businessQuery.data.business.businessType}
        />
      )}

      <VatExemptionReasonModal
        opened={finalization.step === 'vat_exemption'}
        onClose={finalization.closeModal}
        onConfirm={finalization.onVatExemptionConfirmed}
        invoiceNotes={form.values.notes}
      />

      <InvoicePreviewModal
        opened={finalization.step === 'preview' || finalization.step === 'finalizing'}
        onClose={finalization.closeModal}
        onConfirm={finalization.confirmFinalize}
        confirming={finalization.confirming}
        documentType={form.values.documentType}
        invoiceDate={form.values.invoiceDate ? toLocalDateString(form.values.invoiceDate) : null}
        customer={customerInfo}
        items={form.values.items}
        notes={form.values.notes}
        vatExemptionReason={finalization.vatExemptionReason}
      />
    </>
  );
}
