import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { QuickActions } from '../../components/QuickActions';
import { renderWithProviders } from '../utils/renderWithProviders';

describe('QuickActions', () => {
  it('renders all action buttons', () => {
    renderWithProviders(<QuickActions />);

    expect(screen.getByText('חשבונית חדשה')).toBeInTheDocument();
    expect(screen.getByText('הוסף לקוח')).toBeInTheDocument();
    expect(screen.getByText('הגדרות עסק')).toBeInTheDocument();
  });

  it('has invoice and customer buttons linked to their pages', () => {
    renderWithProviders(<QuickActions />);

    const invoiceLink = screen.getByText('חשבונית חדשה').closest('a');
    const customerLink = screen.getByText('הוסף לקוח').closest('a');

    expect(invoiceLink).toHaveAttribute('href', '/business/invoices/new');
    expect(customerLink).toHaveAttribute('href', '/business/customers/new');
  });

  it('has settings button enabled and linking to business settings', () => {
    renderWithProviders(<QuickActions />);

    const settingsLink = screen.getByText('הגדרות עסק').closest('a');
    expect(settingsLink).toHaveAttribute('href', '/business/settings');
  });
});
