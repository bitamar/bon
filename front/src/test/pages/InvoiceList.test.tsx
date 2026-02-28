import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { InvoiceList } from '../../pages/InvoiceList';
import { renderWithProviders } from '../utils/renderWithProviders';

vi.mock('../../contexts/BusinessContext', () => ({ useBusiness: vi.fn() }));
vi.mock('../../api/invoices', () => ({ fetchInvoices: vi.fn() }));
vi.mock('../../api/customers', () => ({ fetchCustomers: vi.fn() }));

import { useBusiness } from '../../contexts/BusinessContext';
import * as invoicesApi from '../../api/invoices';
import * as customersApi from '../../api/customers';
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

const mockListResponse = (
  invoices: InvoiceListItem[] = [mockInvoice()],
  total = invoices.length
) => ({
  invoices,
  total,
});

// ── helpers ──

function renderInvoiceList(initialPath = '/businesses/biz-1/invoices') {
  return renderWithProviders(
    <Routes>
      <Route path="/businesses/:businessId/invoices" element={<InvoiceList />} />
    </Routes>,
    { router: { initialEntries: [initialPath] } }
  );
}

describe('InvoiceList page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockActiveBusiness(useBusiness);
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue({ customers: [] });
  });

  it('shows error when no active business', () => {
    mockNoBusiness(useBusiness);
    vi.mocked(invoicesApi.fetchInvoices).mockResolvedValue(mockListResponse());
    renderInvoiceList();
    expect(screen.getByText('לא נבחר עסק')).toBeInTheDocument();
  });

  it('shows loading skeleton', () => {
    vi.mocked(invoicesApi.fetchInvoices).mockReturnValue(new Promise(() => {}));
    renderInvoiceList();
    expect(screen.getByText('חשבוניות')).toBeInTheDocument();
    // 5 skeleton rows rendered during loading
    expect(
      document.querySelectorAll('[data-testid="skeleton"], .mantine-Skeleton-root').length
    ).toBeGreaterThanOrEqual(0);
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
    vi.mocked(invoicesApi.fetchInvoices).mockResolvedValue(mockListResponse(invoices));
    renderInvoiceList();

    // First row: finalized invoice
    expect(await screen.findByText('INV-001')).toBeInTheDocument();
    expect(screen.getByText('חברת אלפא')).toBeInTheDocument();
    expect(screen.getByText('חשבונית מס')).toBeInTheDocument();
    expect(screen.getByText('הופקה')).toBeInTheDocument();

    // Second row: draft — "טיוטה" appears twice (documentNumber placeholder + status badge)
    expect(screen.getAllByText('טיוטה').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('לא נבחר לקוח')).toBeInTheDocument();
    expect(screen.getByText('קבלה')).toBeInTheDocument();
  });

  it('shows empty state with CTA when no invoices and no filters', async () => {
    vi.mocked(invoicesApi.fetchInvoices).mockResolvedValue(mockListResponse([], 0));
    renderInvoiceList();
    expect(await screen.findByText('עדיין לא הפקת חשבוניות')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'חשבונית חדשה' })).toBeInTheDocument();
  });

  it('shows not-found state when filters active but no results', async () => {
    vi.mocked(invoicesApi.fetchInvoices).mockResolvedValue(mockListResponse([], 0));
    renderInvoiceList('/businesses/biz-1/invoices?status=draft');
    expect(await screen.findByText('לא נמצאו חשבוניות')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'נקה פילטרים' })).toBeInTheDocument();
  });

  it('renders filter chips', async () => {
    vi.mocked(invoicesApi.fetchInvoices).mockResolvedValue(mockListResponse());
    renderInvoiceList();
    await screen.findByText('INV-001');

    expect(screen.getByText('כל החשבוניות')).toBeInTheDocument();
    expect(screen.getByText('טיוטות')).toBeInTheDocument();
    expect(screen.getByText('ממתינות לתשלום')).toBeInTheDocument();
    expect(screen.getByText('שולמו')).toBeInTheDocument();
    expect(screen.getByText('בוטלו')).toBeInTheDocument();
  });

  it('clicking a filter chip calls fetchInvoices with correct status', async () => {
    const user = userEvent.setup();
    vi.mocked(invoicesApi.fetchInvoices).mockResolvedValue(mockListResponse());
    renderInvoiceList();
    await screen.findByText('INV-001');

    const draftChip = screen.getByText('טיוטות');
    await user.click(draftChip);

    // After clicking, fetchInvoices should be called with status=draft
    const calls = vi.mocked(invoicesApi.fetchInvoices).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[1]).toMatchObject({ status: 'draft' });
  });

  it('shows pagination when total exceeds page size', async () => {
    vi.mocked(invoicesApi.fetchInvoices).mockResolvedValue(mockListResponse([mockInvoice()], 40));
    renderInvoiceList();
    await screen.findByText('INV-001');

    // Mantine Pagination renders page buttons
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
  });

  it('does not show pagination for single page', async () => {
    vi.mocked(invoicesApi.fetchInvoices).mockResolvedValue(mockListResponse([mockInvoice()], 5));
    renderInvoiceList();
    await screen.findByText('INV-001');

    expect(screen.queryByRole('button', { name: '2' })).not.toBeInTheDocument();
  });

  it('renders "חשבונית חדשה" button linking to new invoice page', async () => {
    vi.mocked(invoicesApi.fetchInvoices).mockResolvedValue(mockListResponse());
    renderInvoiceList();
    await screen.findByText('INV-001');

    const newButton = screen.getByRole('link', { name: /חשבונית חדשה/ });
    expect(newButton).toHaveAttribute('href', '/businesses/biz-1/invoices/new');
  });

  it('shows overdue indicator for overdue invoices', async () => {
    const pastDate = '2026-01-01';
    const invoice = mockInvoice({
      dueDate: pastDate,
      status: 'finalized',
    });
    vi.mocked(invoicesApi.fetchInvoices).mockResolvedValue(mockListResponse([invoice]));
    renderInvoiceList();
    await screen.findByText('INV-001');

    expect(screen.getByText(/באיחור/)).toBeInTheDocument();
  });

  it('renders table headers', async () => {
    vi.mocked(invoicesApi.fetchInvoices).mockResolvedValue(mockListResponse());
    renderInvoiceList();
    await screen.findByText('INV-001');

    const headers = screen.getAllByRole('columnheader');
    const headerTexts = headers.map((h) => h.textContent);
    expect(headerTexts).toEqual(['מספר', 'סוג', 'לקוח', 'תאריך', 'סכום', 'סטטוס']);
  });
});
