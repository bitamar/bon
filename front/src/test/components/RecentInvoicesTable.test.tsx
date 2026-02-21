import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { RecentInvoicesTable } from '../../components/RecentInvoicesTable';
import { renderWithProviders } from '../utils/renderWithProviders';
import type { RecentInvoice } from '../../hooks/useDashboardData';

const mockInvoices: RecentInvoice[] = [
  {
    id: '1',
    number: 'INV-001',
    customer: 'אלקטרה בע"מ',
    amount: 12400,
    status: 'paid',
    date: '2026-02-18',
  },
  {
    id: '2',
    number: 'INV-002',
    customer: 'סולאר אנרגיה',
    amount: 8750,
    status: 'overdue',
    date: '2026-02-17',
  },
];

describe('RecentInvoicesTable', () => {
  it('renders table headers', () => {
    renderWithProviders(<RecentInvoicesTable invoices={mockInvoices} />);

    expect(screen.getByText('מספר')).toBeInTheDocument();
    expect(screen.getByText('לקוח')).toBeInTheDocument();
    expect(screen.getByText('סכום')).toBeInTheDocument();
    expect(screen.getByText('סטטוס')).toBeInTheDocument();
    expect(screen.getByText('תאריך')).toBeInTheDocument();
  });

  it('renders invoice rows with correct data', () => {
    renderWithProviders(<RecentInvoicesTable invoices={mockInvoices} />);

    expect(screen.getByText('INV-001')).toBeInTheDocument();
    expect(screen.getByText('אלקטרה בע"מ')).toBeInTheDocument();
    expect(screen.getByText('שולמה')).toBeInTheDocument();
    expect(screen.getByText('INV-002')).toBeInTheDocument();
    expect(screen.getByText('באיחור')).toBeInTheDocument();
  });

  it('renders empty state when no invoices', () => {
    renderWithProviders(<RecentInvoicesTable invoices={[]} />);

    expect(screen.getByText('אין חשבוניות להצגה')).toBeInTheDocument();
  });

  it('renders loading skeleton', () => {
    const { container } = renderWithProviders(
      <RecentInvoicesTable invoices={undefined} isLoading />
    );

    const skeletons = container.querySelectorAll('[data-visible="true"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
