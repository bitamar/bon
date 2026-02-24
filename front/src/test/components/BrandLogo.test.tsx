import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { BrandLogo } from '../../components/BrandLogo';
import { renderWithProviders } from '../utils/renderWithProviders';

describe('BrandLogo', () => {
  it('renders the "bon" heading', () => {
    renderWithProviders(<BrandLogo />);
    expect(screen.getByRole('heading', { name: 'bon' })).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    renderWithProviders(<BrandLogo subtitle="פלטפורמת חשבוניות" />);
    expect(screen.getByText('פלטפורמת חשבוניות')).toBeInTheDocument();
  });

  it('does not render subtitle when not provided', () => {
    renderWithProviders(<BrandLogo />);
    expect(screen.queryByText('פלטפורמת חשבוניות')).not.toBeInTheDocument();
  });
});
