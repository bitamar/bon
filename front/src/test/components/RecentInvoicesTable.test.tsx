import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { RecentInvoicesTable } from '../../components/RecentInvoicesTable';
import { renderWithProviders } from '../utils/renderWithProviders';
import type { InvoiceListItem } from '@bon/types/invoices';

// ── helpers ──

function makeInvoice(overrides: Partial<InvoiceListItem> = {}): InvoiceListItem {
  return {
    id: '1',
    businessId: 'biz-1',
    customerId: 'cust-1',
    customerName: 'אלקטרה בע"מ',
    documentType: 'tax_invoice',
    status: 'paid',
    isOverdue: false,
    sequenceGroup: 'tax_document',
    documentNumber: 'INV-001',
    invoiceDate: '2026-02-18',
    dueDate: null,
    totalInclVatMinorUnits: 1240000,
    currency: 'ILS',
    createdAt: '2026-02-18T10:00:00.000Z',
    ...overrides,
  };
}

function renderTable(invoices: InvoiceListItem[] | undefined, isLoading = false) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/businesses/:businessId/*"
        element={<RecentInvoicesTable invoices={invoices} isLoading={isLoading} />}
      />
    </Routes>,
    { router: { initialEntries: ['/businesses/biz-1/dashboard'] } }
  );
}

const mockInvoices = [
  makeInvoice(),
  makeInvoice({ id: '2', documentNumber: 'INV-002', customerName: 'סולאר אנרגיה', status: 'sent' }),
];

describe('RecentInvoicesTable', () => {
  it('renders table headers', () => {
    renderTable(mockInvoices);

    expect(screen.getByText('מספר')).toBeInTheDocument();
    expect(screen.getByText('לקוח')).toBeInTheDocument();
    expect(screen.getByText('סכום')).toBeInTheDocument();
    expect(screen.getByText('סטטוס')).toBeInTheDocument();
    expect(screen.getByText('תאריך')).toBeInTheDocument();
  });

  it('renders invoice rows with correct data', () => {
    renderTable(mockInvoices);

    expect(screen.getByText('INV-001')).toBeInTheDocument();
    expect(screen.getByText('אלקטרה בע"מ')).toBeInTheDocument();
    expect(screen.getByText('שולמה')).toBeInTheDocument();
    expect(screen.getByText('INV-002')).toBeInTheDocument();
    expect(screen.getByText('נשלחה')).toBeInTheDocument();
  });

  it('renders empty state when no invoices', () => {
    renderTable([]);

    expect(screen.getByText('אין חשבוניות להצגה')).toBeInTheDocument();
  });

  it('renders loading skeleton', () => {
    const { container } = renderTable(undefined, true);

    const skeletons = container.querySelectorAll('[data-visible="true"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders "show all" link with correct href', () => {
    renderTable(mockInvoices);

    const link = screen.getByRole('link', { name: 'הצג הכל' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/businesses/biz-1/invoices');
  });
});
