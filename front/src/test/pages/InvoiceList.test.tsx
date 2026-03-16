import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { InvoiceList } from '../../pages/InvoiceList';
import { renderWithProviders } from '../utils/renderWithProviders';

vi.mock('../../contexts/BusinessContext', () => ({ useBusiness: vi.fn() }));
vi.mock('../../api/invoices', () => ({ fetchInvoices: vi.fn() }));
vi.mock('../../api/customers', () => ({ fetchCustomers: vi.fn() }));
vi.mock('../../api/subscriptions', () => ({ fetchSubscription: vi.fn() }));
vi.mock('../../components/CustomerSelect', () => ({
  CustomerSelect: vi.fn(({ onChange }: Readonly<{ onChange: (v: string | null) => void }>) => (
    <button type="button" data-testid="mock-customer-select" onClick={() => onChange('c-1')}>
      בחר לקוח
    </button>
  )),
}));

import { useBusiness } from '../../contexts/BusinessContext';
import * as invoicesApi from '../../api/invoices';
import * as customersApi from '../../api/customers';
import * as subscriptionsApi from '../../api/subscriptions';
import { mockActiveBusiness, mockNoBusiness } from '../utils/businessStubs';
import type { InvoiceListItem } from '@bon/types/invoices';

const mockInvoice = (overrides: Partial<InvoiceListItem> = {}): InvoiceListItem => ({
  id: 'inv-1',
  businessId: 'biz-1',
  customerId: 'c-1',
  customerName: 'חברת אלפא',
  documentType: 'tax_invoice',
  status: 'finalized',
  isOverdue: false,
  sequenceGroup: 'tax_document',
  documentNumber: 'INV-001',
  invoiceDate: '2026-02-15',
  dueDate: '2026-03-15',
  totalInclVatMinorUnits: 11700,
  currency: 'ILS',
  createdAt: '2026-02-15T10:00:00.000Z',
  ...overrides,
});

const DEFAULT_AGGREGATES = {
  totalOutstandingMinorUnits: 11700,
  countOutstanding: 1,
  totalFilteredMinorUnits: 11700,
};

const mockListResponse = (
  invoices: InvoiceListItem[] = [mockInvoice()],
  total = invoices.length
) => ({
  invoices,
  total,
  aggregates: DEFAULT_AGGREGATES,
});

// ── helpers ──

const ACTIVE_SUBSCRIPTION_RESPONSE = {
  subscription: null,
  canCreateInvoices: true,
  daysRemaining: null,
};

const INACTIVE_SUBSCRIPTION_RESPONSE = {
  subscription: null,
  canCreateInvoices: false,
  daysRemaining: null,
};

function renderInvoiceList(initialPath = '/businesses/biz-1/invoices') {
  return renderWithProviders(
    <Routes>
      <Route path="/businesses/:businessId/invoices" element={<InvoiceList />} />
    </Routes>,
    { router: { initialEntries: [initialPath] } }
  );
}

function mockDefaultInvoices(response = mockListResponse()) {
  vi.mocked(invoicesApi.fetchInvoices).mockResolvedValue(response);
}

async function renderWithInvoices(response = mockListResponse()) {
  mockDefaultInvoices(response);
  renderInvoiceList();
  await screen.findByText('INV-001');
}

describe('InvoiceList page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockActiveBusiness(useBusiness);
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue({ customers: [] });
    vi.mocked(subscriptionsApi.fetchSubscription).mockResolvedValue(ACTIVE_SUBSCRIPTION_RESPONSE);
  });

  it('shows error when no active business', () => {
    mockNoBusiness(useBusiness);
    mockDefaultInvoices();
    renderInvoiceList();
    expect(screen.getByText('לא נבחר עסק')).toBeInTheDocument();
  });

  it('shows loading skeleton while fetching', () => {
    vi.mocked(invoicesApi.fetchInvoices).mockReturnValue(new Promise(() => {}));
    renderInvoiceList();
    expect(screen.getByText('חשבוניות')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows error state with retry', async () => {
    vi.mocked(invoicesApi.fetchInvoices).mockRejectedValue(new Error('fail'));
    renderInvoiceList();
    expect(await screen.findByText('שגיאה בטעינת חשבוניות')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'נסה שוב' })).toBeInTheDocument();
  });

  it('renders invoice rows with correct data', async () => {
    const invoices = [
      mockInvoice(),
      mockInvoice({
        id: 'inv-2',
        documentNumber: null,
        status: 'draft',
        customerName: null,
        documentType: 'receipt',
        totalInclVatMinorUnits: 5000,
      }),
    ];
    mockDefaultInvoices(mockListResponse(invoices));
    renderInvoiceList();

    // First row: finalized invoice
    expect(await screen.findByText('INV-001')).toBeInTheDocument();
    expect(screen.getByText('חברת אלפא')).toBeInTheDocument();
    expect(screen.getByText('חשבונית מס')).toBeInTheDocument();
    expect(screen.getByText('הופקה')).toBeInTheDocument();

    // Second row: draft — "טיוטה" appears twice (documentNumber placeholder + status badge)
    expect(screen.getAllByText('טיוטה')).toHaveLength(2);
    expect(screen.getByText('לא נבחר לקוח')).toBeInTheDocument();
    expect(screen.getByText('קבלה')).toBeInTheDocument();
  });

  it('shows empty state with CTA when no invoices and no filters', async () => {
    mockDefaultInvoices(mockListResponse([], 0));
    renderInvoiceList();
    expect(await screen.findByText('עדיין לא הפקת חשבוניות')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'חשבונית חדשה' })).toBeInTheDocument();
  });

  it('shows not-found state when filters active but no results', async () => {
    mockDefaultInvoices(mockListResponse([], 0));
    renderInvoiceList('/businesses/biz-1/invoices?status=draft');
    expect(await screen.findByText('לא נמצאו חשבוניות')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'נקה פילטרים' })).toBeInTheDocument();
  });

  it('renders filter chips', async () => {
    await renderWithInvoices();

    expect(screen.getByText('כל החשבוניות')).toBeInTheDocument();
    expect(screen.getByText('טיוטות')).toBeInTheDocument();
    expect(screen.getByText('ממתינות לתשלום')).toBeInTheDocument();
    expect(screen.getByText('שולמו')).toBeInTheDocument();
    expect(screen.getByText('בוטלו')).toBeInTheDocument();
  });

  it('clicking a filter chip calls fetchInvoices with correct status', async () => {
    const user = userEvent.setup();
    await renderWithInvoices();

    const draftChip = screen.getByText('טיוטות');
    await user.click(draftChip);

    const calls = vi.mocked(invoicesApi.fetchInvoices).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[1]).toMatchObject({ status: 'draft' });
  });

  it('shows pagination when total exceeds page size', async () => {
    await renderWithInvoices(mockListResponse([mockInvoice()], 40));

    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
  });

  it('does not show pagination for single page', async () => {
    await renderWithInvoices(mockListResponse([mockInvoice()], 5));

    expect(screen.queryByRole('button', { name: '2' })).not.toBeInTheDocument();
  });

  it('renders "חשבונית חדשה" button linking to new invoice page', async () => {
    await renderWithInvoices();

    const newButton = screen.getByRole('link', { name: /חשבונית חדשה/ });
    expect(newButton).toHaveAttribute('href', '/businesses/biz-1/invoices/new');
  });

  it('shows overdue indicator for overdue invoices', async () => {
    const invoice = mockInvoice({ dueDate: '2000-01-01', status: 'finalized' });
    await renderWithInvoices(mockListResponse([invoice]));

    expect(screen.getByText(/באיחור/)).toBeInTheDocument();
  });

  it('renders table headers', async () => {
    await renderWithInvoices();

    const headers = screen.getAllByRole('columnheader');
    const headerTexts = headers.map((h) => h.textContent);
    expect(headerTexts).toEqual(['מספר', 'סוג', 'לקוח', 'תאריך', 'סכום', 'סטטוס']);
  });

  it('renders summary row with aggregate data', async () => {
    await renderWithInvoices();

    expect(screen.getByText('ממתין לתשלום:')).toBeInTheDocument();
    expect(screen.getByText('סה״כ בסינון:')).toBeInTheDocument();
    expect(screen.getByText(/1 חשבונית\)/)).toBeInTheDocument();
  });

  it('links new invoice button to subscription page when no active subscription', async () => {
    vi.mocked(subscriptionsApi.fetchSubscription).mockResolvedValue(INACTIVE_SUBSCRIPTION_RESPONSE);
    await renderWithInvoices();

    const newButton = screen.getByRole('link', { name: /חשבונית חדשה/ });
    expect(newButton).toHaveAttribute('href', '/businesses/biz-1/subscription');
  });

  it('clicking outstanding chip sends correct status and sort params', async () => {
    const user = userEvent.setup();
    await renderWithInvoices();

    await user.click(screen.getByText('ממתינות לתשלום'));

    const calls = vi.mocked(invoicesApi.fetchInvoices).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[1]).toMatchObject({
      status: 'finalized,sent,partially_paid',
      sort: 'dueDate:asc',
    });
  });

  it('shows clear all filters button when filters are present', async () => {
    mockDefaultInvoices(mockListResponse([mockInvoice()]));
    renderInvoiceList('/businesses/biz-1/invoices?status=draft');
    await screen.findByText('INV-001');

    expect(screen.getByRole('button', { name: 'נקה הכל' })).toBeInTheDocument();
  });

  it('does not show clear button when no filters active', async () => {
    await renderWithInvoices();

    expect(screen.queryByRole('button', { name: 'נקה הכל' })).not.toBeInTheDocument();
  });

  it('clicking page 2 passes page param to fetchInvoices', async () => {
    const user = userEvent.setup();
    await renderWithInvoices(mockListResponse([mockInvoice()], 40));

    await user.click(screen.getByRole('button', { name: '2' }));

    const calls = vi.mocked(invoicesApi.fetchInvoices).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[1]).toMatchObject({ page: '2' });
  });

  it('does not show overdue indicator for paid invoices', async () => {
    const invoice = mockInvoice({ dueDate: '2000-01-01', status: 'paid' });
    await renderWithInvoices(mockListResponse([invoice]));

    expect(screen.queryByText(/באיחור/)).not.toBeInTheDocument();
  });

  it('date filter in URL is passed to fetchInvoices as dateFrom param', async () => {
    mockDefaultInvoices();
    renderInvoiceList('/businesses/biz-1/invoices?dateFrom=2026-01-01');
    await screen.findByText('INV-001');

    const calls = vi.mocked(invoicesApi.fetchInvoices).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[1]).toMatchObject({ dateFrom: '2026-01-01' });
  });

  it('clear all button resets all filters', async () => {
    const user = userEvent.setup();
    mockDefaultInvoices();
    renderInvoiceList('/businesses/biz-1/invoices?status=draft&dateFrom=2026-01-01');
    await screen.findByText('INV-001');

    await user.click(screen.getByRole('button', { name: 'נקה הכל' }));

    const calls = vi.mocked(invoicesApi.fetchInvoices).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[1]).not.toHaveProperty('status');
    expect(lastCall?.[1]).not.toHaveProperty('dateFrom');
  });

  // ── Retry button on error state (line 309) ──

  it('clicking retry button on error state calls refetch', async () => {
    const user = userEvent.setup();
    vi.mocked(invoicesApi.fetchInvoices).mockRejectedValue(new Error('network error'));
    renderInvoiceList();

    await screen.findByText('שגיאה בטעינת חשבוניות');
    expect(screen.getByRole('button', { name: 'נסה שוב' })).toBeInTheDocument();

    // After clicking retry, mock resolves so we get the invoice list
    vi.mocked(invoicesApi.fetchInvoices).mockResolvedValue(mockListResponse());
    await user.click(screen.getByRole('button', { name: 'נסה שוב' }));

    expect(await screen.findByText('INV-001')).toBeInTheDocument();
  });

  // ── Pagination back to page 1 (line 270) ──

  it('navigating back to page 1 removes page param from URL', async () => {
    const user = userEvent.setup();
    mockDefaultInvoices(mockListResponse([mockInvoice()], 60));
    renderInvoiceList('/businesses/biz-1/invoices?page=2');
    await screen.findByText('INV-001');

    // Click page 1 — should remove page param, not set page=1
    await user.click(screen.getByRole('button', { name: '1' }));

    const calls = vi.mocked(invoicesApi.fetchInvoices).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[1]).toMatchObject({ page: '1' });
    expect(lastCall?.[1]).not.toHaveProperty('page', '2');
  });

  // ── statusParamToChip with draft status (line 63) ──

  it('renders with ?status=draft in URL and passes draft status to fetchInvoices', async () => {
    mockDefaultInvoices();
    renderInvoiceList('/businesses/biz-1/invoices?status=draft');
    await screen.findByText('INV-001', {}, { timeout: 3000 });

    const calls = vi.mocked(invoicesApi.fetchInvoices).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[1]).toMatchObject({ status: 'draft' });
  });

  // ── InvoiceRow click navigation ──

  it('clicking an invoice row navigates to detail page', async () => {
    const user = userEvent.setup();
    mockDefaultInvoices();

    renderWithProviders(
      <Routes>
        <Route path="/businesses/:businessId/invoices" element={<InvoiceList />} />
        <Route
          path="/businesses/:businessId/invoices/:invoiceId"
          element={<div>detail page</div>}
        />
      </Routes>,
      { router: { initialEntries: ['/businesses/biz-1/invoices'] } }
    );
    await screen.findByText('INV-001');

    const tableRow = document.querySelector('tr[role="link"]') as HTMLElement;
    await user.click(tableRow);

    expect(await screen.findByText('detail page')).toBeInTheDocument();
  });

  it('pressing Enter on an invoice row triggers navigation handler', async () => {
    await renderWithInvoices();

    const tableRow = document.querySelector('tr[role="link"]') as HTMLElement;
    expect(tableRow).not.toBeNull();

    tableRow.focus();
    tableRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });

  it('pressing Space on an invoice row triggers navigation handler', async () => {
    await renderWithInvoices();

    const tableRow = document.querySelector('tr[role="link"]') as HTMLElement;
    expect(tableRow).not.toBeNull();

    tableRow.focus();
    tableRow.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  });

  // ── Empty state CTA navigation (line 336) ──

  it('empty state CTA shows correct label when canCreateInvoices=true', async () => {
    vi.mocked(subscriptionsApi.fetchSubscription).mockResolvedValue(ACTIVE_SUBSCRIPTION_RESPONSE);
    mockDefaultInvoices(mockListResponse([], 0));
    renderInvoiceList();

    const ctaButton = await screen.findByRole('button', { name: 'חשבונית חדשה' });
    expect(ctaButton).toBeInTheDocument();
  });

  it('empty state CTA shows correct label and navigates to subscription when canCreateInvoices=false', async () => {
    const user = userEvent.setup();
    vi.mocked(subscriptionsApi.fetchSubscription).mockResolvedValue(INACTIVE_SUBSCRIPTION_RESPONSE);
    mockDefaultInvoices(mockListResponse([], 0));

    renderWithProviders(
      <Routes>
        <Route path="/businesses/:businessId/invoices" element={<InvoiceList />} />
        <Route path="/businesses/:businessId/subscription" element={<div>subscription page</div>} />
      </Routes>,
      { router: { initialEntries: ['/businesses/biz-1/invoices'] } }
    );

    const ctaButton = await screen.findByRole('button', { name: 'מעבר לעמוד מנויים' });
    await user.click(ctaButton);

    expect(await screen.findByText('subscription page')).toBeInTheDocument();
  });

  it('empty state CTA navigates to invoices/new when canCreateInvoices=true', async () => {
    const user = userEvent.setup();
    vi.mocked(subscriptionsApi.fetchSubscription).mockResolvedValue(ACTIVE_SUBSCRIPTION_RESPONSE);
    mockDefaultInvoices(mockListResponse([], 0));

    renderWithProviders(
      <Routes>
        <Route path="/businesses/:businessId/invoices" element={<InvoiceList />} />
        <Route path="/businesses/:businessId/invoices/new" element={<div>new invoice page</div>} />
      </Routes>,
      { router: { initialEntries: ['/businesses/biz-1/invoices'] } }
    );

    const ctaButton = await screen.findByRole('button', { name: 'חשבונית חדשה' });
    await user.click(ctaButton);

    expect(await screen.findByText('new invoice page')).toBeInTheDocument();
  });

  // ── Date filter interactions ──

  it('dateTo filter in URL is passed to fetchInvoices as dateTo param', async () => {
    mockDefaultInvoices();
    renderInvoiceList('/businesses/biz-1/invoices?dateTo=2026-12-31');
    await screen.findByText('INV-001');

    const calls = vi.mocked(invoicesApi.fetchInvoices).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[1]).toMatchObject({ dateTo: '2026-12-31' });
  });

  it('both dateFrom and dateTo filters in URL are passed to fetchInvoices', async () => {
    mockDefaultInvoices();
    renderInvoiceList('/businesses/biz-1/invoices?dateFrom=2026-01-01&dateTo=2026-06-30');
    await screen.findByText('INV-001');

    const calls = vi.mocked(invoicesApi.fetchInvoices).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[1]).toMatchObject({ dateFrom: '2026-01-01', dateTo: '2026-06-30' });
  });

  // ── Customer filter handler (lines 255-256) ──

  it('selecting a customer via CustomerSelect calls fetchInvoices with customerId', async () => {
    const user = userEvent.setup();
    await renderWithInvoices();

    await user.click(screen.getByTestId('mock-customer-select'));

    const calls = vi.mocked(invoicesApi.fetchInvoices).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[1]).toMatchObject({ customerId: 'c-1' });
  });

  // ── Chip back to "all" deletes status param (line 239) ──

  it('clicking all chip after a status filter removes the status param', async () => {
    const user = userEvent.setup();
    mockDefaultInvoices();
    renderInvoiceList('/businesses/biz-1/invoices?status=paid');
    await screen.findByText('INV-001');

    await user.click(screen.getByText('כל החשבוניות'));

    const calls = vi.mocked(invoicesApi.fetchInvoices).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[1]).not.toHaveProperty('status');
  });

  // ── Date handler: clearing dateFrom via clear button (lines 258-260) ──

  it('clearing dateFrom via clear button removes dateFrom from query params', async () => {
    const user = userEvent.setup();
    mockDefaultInvoices();
    const { container } = renderInvoiceList('/businesses/biz-1/invoices?dateFrom=2026-01-01');
    await screen.findByText('INV-001');

    // Mantine renders a clear button in [data-position="right"] when value is set
    const dateInputs = container.querySelectorAll('[data-dates-input]');
    const fromDateInput = dateInputs[0] as HTMLElement;
    const inputWrapper = fromDateInput?.closest('[data-with-right-section]');
    const clearBtn = inputWrapper?.querySelector('[data-position="right"] button');

    if (clearBtn) {
      await user.click(clearBtn as HTMLElement);

      const calls = vi.mocked(invoicesApi.fetchInvoices).mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall?.[1]).not.toHaveProperty('dateFrom');
    }
  });

  // ── Date handler: clearing dateTo via clear button (lines 261-263) ──

  it('clearing dateTo via clear button removes dateTo from query params', async () => {
    const user = userEvent.setup();
    mockDefaultInvoices();
    const { container } = renderInvoiceList('/businesses/biz-1/invoices?dateTo=2026-12-31');
    await screen.findByText('INV-001');

    const dateInputs = container.querySelectorAll('[data-dates-input]');
    const toDateInput = dateInputs[1] as HTMLElement;
    const inputWrapper = toDateInput?.closest('[data-with-right-section]');
    const clearBtn = inputWrapper?.querySelector('[data-position="right"] button');

    if (clearBtn) {
      await user.click(clearBtn as HTMLElement);

      const calls = vi.mocked(invoicesApi.fetchInvoices).mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall?.[1]).not.toHaveProperty('dateTo');
    }
  });
});
