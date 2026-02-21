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

  it('has invoice and customer buttons disabled', () => {
    renderWithProviders(<QuickActions />);

    const invoiceButton = screen.getByText('חשבונית חדשה').closest('button');
    const customerButton = screen.getByText('הוסף לקוח').closest('button');

    expect(invoiceButton).toBeDisabled();
    expect(customerButton).toBeDisabled();
  });

  it('has settings button enabled and linking to business settings', () => {
    renderWithProviders(<QuickActions />);

    const settingsLink = screen.getByText('הגדרות עסק').closest('a');
    expect(settingsLink).toHaveAttribute('href', '/business/settings');
  });
});
