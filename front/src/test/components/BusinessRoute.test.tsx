import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { BusinessRoute } from '../../components/BusinessRoute';
import { renderWithProviders } from '../utils/renderWithProviders';

vi.mock('../../contexts/BusinessContext', () => ({ useBusiness: vi.fn() }));

import { useBusiness } from '../../contexts/BusinessContext';

// ── helpers ──

const BIZ = {
  id: 'biz-1',
  name: 'Test Co',
  businessType: 'licensed_dealer' as const,
  registrationNumber: '123456789',
  isActive: true,
  role: 'owner' as const,
};

function renderRoute(bizId: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/businesses/:businessId" element={<BusinessRoute />}>
        <Route index element={<div>outlet-content</div>} />
      </Route>
    </Routes>,
    { router: { initialEntries: [`/businesses/${bizId}`] } }
  );
}

describe('BusinessRoute', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders nothing (no outlet, no error) when loading', () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: null,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: true,
    });

    renderRoute('biz-1');

    expect(screen.queryByText('outlet-content')).not.toBeInTheDocument();
    expect(screen.queryByText('העסק לא נמצא')).not.toBeInTheDocument();
  });

  it('shows error when businessId does not match any business', () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: null,
      businesses: [BIZ],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    renderRoute('unknown-biz');

    expect(screen.getByText('העסק לא נמצא')).toBeInTheDocument();
    expect(screen.getByText('אין לך גישה לעסק זה, או שהוא לא קיים')).toBeInTheDocument();
  });

  it('renders Outlet when businessId matches', () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: BIZ,
      businesses: [BIZ],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    renderRoute('biz-1');

    expect(screen.getByText('outlet-content')).toBeInTheDocument();
  });

  it('shows error when businesses is empty (not loading)', () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: null,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    renderRoute('biz-1');

    expect(screen.getByText('העסק לא נמצא')).toBeInTheDocument();
  });
});
