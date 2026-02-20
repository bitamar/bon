import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Dashboard } from '../../pages/Dashboard';
import { renderWithProviders } from '../utils/renderWithProviders';

describe('Dashboard page', () => {
  it('renders the dashboard intro card', () => {
    renderWithProviders(<Dashboard />);

    expect(screen.getByRole('heading', { name: 'ראשי' })).toBeInTheDocument();
    expect(screen.getByText('הכל מוכן.')).toBeInTheDocument();
    expect(screen.getByText(/המערכת מוכנה לשימוש/)).toBeInTheDocument();
  });
});
