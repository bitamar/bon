import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { QuickActions } from '../../components/QuickActions';
import { renderWithProviders } from '../utils/renderWithProviders';

// ── helpers ──

function renderQuickActions() {
  return renderWithProviders(
    <Routes>
      <Route path="/businesses/:businessId/*" element={<QuickActions />} />
    </Routes>,
    { router: { initialEntries: ['/businesses/biz-1/dashboard'] } }
  );
}

describe('QuickActions', () => {
  it('renders invoice and customer buttons', () => {
    renderQuickActions();

    expect(screen.getByText('חשבונית חדשה')).toBeInTheDocument();
    expect(screen.getByText('הוסף לקוח')).toBeInTheDocument();
  });

  it('does not render settings button', () => {
    renderQuickActions();

    expect(screen.queryByText('הגדרות עסק')).not.toBeInTheDocument();
  });

  it('has invoice and customer buttons linked to their pages', () => {
    renderQuickActions();

    const invoiceLink = screen.getByText('חשבונית חדשה').closest('a');
    const customerLink = screen.getByText('הוסף לקוח').closest('a');

    expect(invoiceLink).toHaveAttribute('href', '/businesses/biz-1/invoices/new');
    expect(customerLink).toHaveAttribute('href', '/businesses/biz-1/customers/new');
  });
});
