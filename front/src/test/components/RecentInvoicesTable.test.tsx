import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecentInvoicesTable } from '../../components/RecentInvoicesTable';
import { renderWithProviders } from '../utils/renderWithProviders';
import type { InvoiceListItem } from '@bon/types/invoices';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: vi.fn() };
});

import { useNavigate } from 'react-router-dom';

// ── helpers ──

function makeInvoice(overrides: Partial<InvoiceListItem> = {}): InvoiceListItem {
  return {
    id: 'inv-1',
    businessId: 'biz-1',
    customerId: 'cust-1',
    customerName: 'אלקטרה בע"מ',
    documentType: 'tax_invoice',
    status: 'paid',
    isOverdue: false,
    sequenceGroup: 'tax_document',
    documentNumber: 'INV-001',
    invoiceDate: '2026-02-18',
    dueDate: '2026-03-18',
    totalInclVatMinorUnits: 1240000,
    currency: 'ILS',
    createdAt: '2026-02-18T10:00:00.000Z',
    ...overrides,
  };
}

const mockInvoices: InvoiceListItem[] = [
  makeInvoice(),
  makeInvoice({
    id: 'inv-2',
    customerName: 'סולאר אנרגיה',
    documentNumber: 'INV-002',
    status: 'sent',
    totalInclVatMinorUnits: 875000,
    invoiceDate: '2026-02-17',
  }),
];

function mockNavigate() {
  const navigateFn = vi.fn();
  vi.mocked(useNavigate).mockReturnValue(navigateFn);
  return navigateFn;
}

describe('RecentInvoicesTable', () => {
  it('renders table headers and invoice rows', () => {
    renderWithProviders(<RecentInvoicesTable invoices={mockInvoices} businessId="biz-1" />);

    expect(screen.getByText('מספר')).toBeInTheDocument();
    expect(screen.getByText('לקוח')).toBeInTheDocument();
    expect(screen.getByText('INV-001')).toBeInTheDocument();
    expect(screen.getByText('אלקטרה בע"מ')).toBeInTheDocument();
    expect(screen.getByText('שולמה')).toBeInTheDocument();
    expect(screen.getByText('INV-002')).toBeInTheDocument();
    expect(screen.getByText('נשלחה')).toBeInTheDocument();
  });

  it('renders empty state when no invoices', () => {
    renderWithProviders(<RecentInvoicesTable invoices={[]} businessId="biz-1" />);

    expect(screen.getByText('אין חשבוניות להצגה')).toBeInTheDocument();
  });

  it('renders loading skeleton', () => {
    const { container } = renderWithProviders(
      <RecentInvoicesTable invoices={undefined} businessId="biz-1" isLoading />
    );

    const skeletons = container.querySelectorAll('[data-visible="true"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders error state when error is provided', () => {
    renderWithProviders(
      <RecentInvoicesTable invoices={undefined} businessId="biz-1" error={new Error('fail')} />
    );
    expect(screen.getByText('שגיאה בטעינת חשבוניות אחרונות')).toBeInTheDocument();
  });

  it('renders empty state when invoices is undefined and not loading', () => {
    renderWithProviders(<RecentInvoicesTable invoices={undefined} businessId="biz-1" />);
    expect(screen.getByText('אין חשבוניות להצגה')).toBeInTheDocument();
  });

  it('renders "show all" link with correct href', () => {
    renderWithProviders(<RecentInvoicesTable invoices={mockInvoices} businessId="biz-1" />);

    const link = screen.getByRole('link', { name: 'הצג הכל' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/businesses/biz-1/invoices');
  });

  it('navigates to invoice detail on row click', async () => {
    const user = userEvent.setup();
    const navigateFn = mockNavigate();
    renderWithProviders(<RecentInvoicesTable invoices={mockInvoices} businessId="biz-1" />);

    await user.click(screen.getByText('INV-001'));

    expect(navigateFn).toHaveBeenCalledWith('/businesses/biz-1/invoices/inv-1');
  });

  it('navigates to invoice detail on Enter keypress', async () => {
    const user = userEvent.setup();
    const navigateFn = mockNavigate();
    renderWithProviders(<RecentInvoicesTable invoices={mockInvoices} businessId="biz-1" />);

    const rows = screen.getAllByRole('row');
    await user.type(rows[1]!, '{Enter}');

    expect(navigateFn).toHaveBeenCalledWith('/businesses/biz-1/invoices/inv-1');
  });

  it('renders dash for missing document number', () => {
    const invoice = makeInvoice({ documentNumber: null });
    renderWithProviders(<RecentInvoicesTable invoices={[invoice]} businessId="biz-1" />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders dash for missing customer name', () => {
    const invoice = makeInvoice({ customerName: null });
    renderWithProviders(<RecentInvoicesTable invoices={[invoice]} businessId="biz-1" />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
