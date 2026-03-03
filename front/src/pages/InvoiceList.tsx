import {
  Badge,
  Box,
  Button,
  Chip,
  Container,
  Grid,
  Group,
  LoadingOverlay,
  Pagination,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { DatePickerInput, type DateValue } from '@mantine/dates';
import { IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { InvoiceSummaryRow } from '../components/InvoiceSummaryRow';
import { PageTitle } from '../components/PageTitle';
import { StatusCard } from '../components/StatusCard';
import { CustomerSelect } from '../components/CustomerSelect';
import { fetchInvoices } from '../api/invoices';
import { queryKeys } from '../lib/queryKeys';
import { useBusiness } from '../contexts/BusinessContext';
import { INVOICE_STATUS_CONFIG } from '../lib/invoiceStatus';
import { DOCUMENT_TYPE_LABELS, type InvoiceListItem } from '@bon/types/invoices';
import { formatDate, formatMinorUnits } from '@bon/types/formatting';

// ── Status chip presets ──

const STATUS_CHIPS = [
  { value: 'all', label: 'כל החשבוניות' },
  { value: 'draft', label: 'טיוטות' },
  { value: 'outstanding', label: 'ממתינות לתשלום' },
  { value: 'paid', label: 'שולמו' },
  { value: 'cancelled', label: 'בוטלו' },
] as const;

type ChipValue = (typeof STATUS_CHIPS)[number]['value'];

function chipToStatusParam(chip: ChipValue): string | undefined {
  switch (chip) {
    case 'all':
      return undefined;
    case 'outstanding':
      return 'finalized,sent,partially_paid';
    default:
      return chip;
  }
}

function chipToSortParam(chip: ChipValue): string {
  return chip === 'outstanding' ? 'dueDate:asc' : 'invoiceDate:desc';
}

function statusParamToChip(status: string | null): ChipValue {
  if (!status) return 'all';
  if (status === 'draft') return 'draft';
  if (status === 'paid') return 'paid';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'finalized,sent,partially_paid') return 'outstanding';
  return 'all';
}

// ── Date helpers ──

function toDateValue(dateStr: string | null): DateValue {
  if (!dateStr) return null;
  const parts = dateStr.split('-').map(Number);
  return new Date(parts[0] ?? 0, (parts[1] ?? 1) - 1, parts[2] ?? 1);
}

function toIsoDate(date: DateValue): string | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Overdue helper ──

const MS_PER_DAY = 86_400_000;

function daysOverdue(dueDate: string): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const parts = dueDate.split('-').map(Number);
  const due = new Date(parts[0] ?? 0, (parts[1] ?? 1) - 1, parts[2] ?? 1);
  return Math.floor((today.getTime() - due.getTime()) / MS_PER_DAY);
}

const OVERDUE_STATUSES = new Set(['finalized', 'sent', 'partially_paid']);

// ── Skeleton rows ──

function SkeletonRows() {
  return (
    <Stack gap="xs">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} height={48} />
      ))}
    </Stack>
  );
}

// ── Invoice table row ──

function InvoiceRow({
  invoice,
  bizPrefix,
  onNavigate,
}: Readonly<{ invoice: InvoiceListItem; bizPrefix: string; onNavigate: (path: string) => void }>) {
  const statusConfig = INVOICE_STATUS_CONFIG[invoice.status];
  const docLabel = DOCUMENT_TYPE_LABELS[invoice.documentType];
  const overdue =
    invoice.dueDate && OVERDUE_STATUSES.has(invoice.status) ? daysOverdue(invoice.dueDate) : 0;
  const detailPath = `${bizPrefix}/invoices/${invoice.id}`;

  return (
    <Table.Tr
      style={{ cursor: 'pointer' }}
      onClick={() => onNavigate(detailPath)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onNavigate(detailPath);
        }
      }}
      tabIndex={0}
      role="link"
    >
      <Table.Td>
        {invoice.documentNumber ? (
          <Text size="sm" fw={500}>
            {invoice.documentNumber}
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            טיוטה
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        <Badge variant="light" size="sm">
          {docLabel}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{invoice.customerName ?? 'לא נבחר לקוח'}</Text>
      </Table.Td>
      <Table.Td>
        <Stack gap={0}>
          <Text size="sm">{formatDate(invoice.invoiceDate)}</Text>
          {overdue > 0 ? (
            <Text size="xs" c="red" fw={500}>
              באיחור {overdue} ימים
            </Text>
          ) : null}
        </Stack>
      </Table.Td>
      <Table.Td>
        <Text size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatMinorUnits(invoice.totalInclVatMinorUnits, invoice.currency)}
        </Text>
      </Table.Td>
      <Table.Td>
        <Badge variant="light" color={statusConfig.color} size="sm">
          {statusConfig.label}
        </Badge>
      </Table.Td>
    </Table.Tr>
  );
}

// ── Main component ──

const ITEMS_PER_PAGE = 20;

export function InvoiceList() {
  const { businessId = '' } = useParams<{ businessId: string }>();
  const { activeBusiness } = useBusiness();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const bizPrefix = `/businesses/${businessId}`;

  // ── Read filters from URL ──
  const chipValue = statusParamToChip(searchParams.get('status'));
  const customerId = searchParams.get('customerId') ?? undefined;
  const dateFrom = searchParams.get('dateFrom') ?? undefined;
  const dateTo = searchParams.get('dateTo') ?? undefined;
  const rawPage = parseInt(searchParams.get('page') ?? '1', 10);
  const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;

  const statusParam = chipToStatusParam(chipValue);
  const sortParam = chipToSortParam(chipValue);

  // ── Build query params ──
  const queryParams: Record<string, string> = {
    page: String(page),
    limit: String(ITEMS_PER_PAGE),
    sort: sortParam,
  };
  if (statusParam) queryParams['status'] = statusParam;
  if (customerId) queryParams['customerId'] = customerId;
  if (dateFrom) queryParams['dateFrom'] = dateFrom;
  if (dateTo) queryParams['dateTo'] = dateTo;

  const invoicesQuery = useQuery({
    queryKey: queryKeys.invoiceList(businessId, queryParams),
    queryFn: () => fetchInvoices(businessId, queryParams),
    enabled: !!businessId && !!activeBusiness,
    placeholderData: (prev) => prev,
  });

  // ── Filter update helpers ──
  function updateFilters(updates: Record<string, string | null>) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('page');
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      return next;
    });
  }

  function handleChipChange(value: string | string[]) {
    const chip = (Array.isArray(value) ? value[0] : value) as ChipValue;
    const status = chipToStatusParam(chip);
    updateFilters({ status: status ?? null });
  }

  function handleCustomerChange(value: string | null) {
    updateFilters({ customerId: value });
  }

  function handleDateFromChange(value: DateValue) {
    updateFilters({ dateFrom: toIsoDate(value) });
  }

  function handleDateToChange(value: DateValue) {
    updateFilters({ dateTo: toIsoDate(value) });
  }

  function handlePageChange(newPage: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newPage === 1) {
        next.delete('page');
      } else {
        next.set('page', String(newPage));
      }
      return next;
    });
  }

  const hasActiveFilters = !!(statusParam || customerId || dateFrom || dateTo);

  function clearAllFilters() {
    setSearchParams({});
  }

  // ── Guards ──
  if (!activeBusiness) {
    return (
      <Container size="lg" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard status="error" title="לא נבחר עסק" description="אנא בחר עסק מהתפריט" />
      </Container>
    );
  }

  // ── Render ──
  const totalPages = invoicesQuery.data ? Math.ceil(invoicesQuery.data.total / ITEMS_PER_PAGE) : 0;
  const isInitialLoading = invoicesQuery.isPending;
  const isFilterLoading = invoicesQuery.isFetching && !invoicesQuery.isPending;

  function renderContent() {
    if (isInitialLoading) return <SkeletonRows />;

    if (invoicesQuery.error) {
      return (
        <StatusCard
          status="error"
          title="שגיאה בטעינת חשבוניות"
          description="לא הצלחנו לטעון את רשימת החשבוניות"
          primaryAction={{
            label: 'נסה שוב',
            onClick: () => invoicesQuery.refetch(),
            loading: invoicesQuery.isFetching,
          }}
        />
      );
    }

    if (invoicesQuery.data?.invoices.length === 0) {
      return hasActiveFilters ? (
        <StatusCard
          status="notFound"
          title="לא נמצאו חשבוניות"
          description="לא נמצאו חשבוניות התואמות את החיפוש. נסו לשנות את הסינון."
          primaryAction={{ label: 'נקה פילטרים', onClick: clearAllFilters }}
        />
      ) : (
        <StatusCard
          status="empty"
          title="עדיין לא הפקת חשבוניות"
          description="לחצו 'חשבונית חדשה' כדי להתחיל."
          primaryAction={{
            label: 'חשבונית חדשה',
            onClick: () => navigate(`${bizPrefix}/invoices/new`),
          }}
        />
      );
    }

    if (!invoicesQuery.data) return null;

    return (
      <Box pos="relative">
        <LoadingOverlay visible={isFilterLoading} loaderProps={{ size: 'sm' }} />
        <Table highlightOnHover withRowBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>מספר</Table.Th>
              <Table.Th>סוג</Table.Th>
              <Table.Th>לקוח</Table.Th>
              <Table.Th>תאריך</Table.Th>
              <Table.Th>סכום</Table.Th>
              <Table.Th>סטטוס</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {invoicesQuery.data.invoices.map((invoice) => (
              <InvoiceRow
                key={invoice.id}
                invoice={invoice}
                bizPrefix={bizPrefix}
                onNavigate={navigate}
              />
            ))}
          </Table.Tbody>
        </Table>
      </Box>
    );
  }

  return (
    <Container size="lg" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between">
          <PageTitle order={3}>חשבוניות</PageTitle>
          <Button
            leftSection={<IconPlus size={18} />}
            component={Link}
            to={`${bizPrefix}/invoices/new`}
          >
            חשבונית חדשה
          </Button>
        </Group>

        {/* Filters */}
        <Paper withBorder p="md">
          <Stack gap="sm">
            <Chip.Group value={chipValue} onChange={handleChipChange}>
              <Group gap="xs">
                {STATUS_CHIPS.map((chip) => (
                  <Chip key={chip.value} value={chip.value} variant="light">
                    {chip.label}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>

            <Grid>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <CustomerSelect
                  businessId={businessId}
                  value={customerId ?? null}
                  onChange={handleCustomerChange}
                  label="סנן לפי לקוח"
                  showCreateLink={false}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 4 }}>
                <DatePickerInput
                  label="מתאריך"
                  value={toDateValue(dateFrom ?? null)}
                  onChange={handleDateFromChange}
                  clearable
                />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 4 }}>
                <DatePickerInput
                  label="עד תאריך"
                  value={toDateValue(dateTo ?? null)}
                  onChange={handleDateToChange}
                  clearable
                />
              </Grid.Col>
            </Grid>

            {hasActiveFilters ? (
              <Group>
                <Button variant="subtle" size="compact-sm" onClick={clearAllFilters}>
                  נקה הכל
                </Button>
              </Group>
            ) : null}
          </Stack>
        </Paper>

        {/* Summary row */}
        {invoicesQuery.data ? (
          <InvoiceSummaryRow aggregates={invoicesQuery.data.aggregates} />
        ) : null}

        {/* Content area */}
        {renderContent()}

        {/* Pagination */}
        {totalPages > 1 ? (
          <Group justify="center">
            <Pagination value={page} onChange={handlePageChange} total={totalPages} withEdges />
          </Group>
        ) : null}
      </Stack>
    </Container>
  );
}
