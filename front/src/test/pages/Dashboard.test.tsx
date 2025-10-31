import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Dashboard } from '../../pages/Dashboard';
import { renderWithProviders } from '../utils/renderWithProviders';

describe('Dashboard page', () => {
  it('renders the dashboard intro card', () => {
    renderWithProviders(<Dashboard />);

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText("You're all set.")).toBeInTheDocument();
    expect(
      screen.getByText(/This starter leaves the business logic up to you/i)
    ).toBeInTheDocument();
  });
});
