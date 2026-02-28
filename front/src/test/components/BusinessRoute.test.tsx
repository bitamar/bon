import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { BusinessRoute } from '../../components/BusinessRoute';
import { renderWithProviders } from '../utils/renderWithProviders';

vi.mock('../../contexts/BusinessContext', () => ({ useBusiness: vi.fn() }));

import { useBusiness } from '../../contexts/BusinessContext';

// ── helpers ──
const mockBusiness = {
  id: 'biz-1',
  name: 'Acme Ltd',
  businessType: 'licensed_dealer' as const,
  registrationNumber: '123456789',
  isActive: true,
  role: 'owner' as const,
};

function setupMock(overrides: Partial<ReturnType<typeof useBusiness>>) {
  vi.mocked(useBusiness).mockReturnValue({
    activeBusiness: null,
    businesses: [],
    switchBusiness: vi.fn(),
    isLoading: false,
    ...overrides,
  });
}

function TestHarness() {
  return (
    <Routes>
      <Route path="/businesses/:businessId" element={<BusinessRoute />}>
        <Route index element={<div>child content</div>} />
      </Route>
    </Routes>
  );
}

function renderAtPath(path: string) {
  return renderWithProviders(<TestHarness />, {
    router: { initialEntries: [path] },
  });
}

describe('BusinessRoute', () => {
  beforeEach(() => {
    vi.mocked(useBusiness).mockReset();
  });

  it('returns null when isLoading is true', () => {
    setupMock({ isLoading: true, businesses: [] });

    renderAtPath('/businesses/biz-1');

    expect(screen.queryByText('העסק לא נמצא')).not.toBeInTheDocument();
    expect(screen.queryByText('child content')).not.toBeInTheDocument();
  });

  it('shows error StatusCard when businessId does not match any business', () => {
    setupMock({ isLoading: false, businesses: [mockBusiness] });

    renderAtPath('/businesses/non-existent');

    expect(screen.getByText('העסק לא נמצא')).toBeInTheDocument();
    expect(screen.getByText('אין לך גישה לעסק זה, או שהוא לא קיים')).toBeInTheDocument();
  });

  it('renders Outlet when businessId matches a business', () => {
    setupMock({ isLoading: false, businesses: [mockBusiness] });

    renderAtPath('/businesses/biz-1');

    expect(screen.getByText('child content')).toBeInTheDocument();
  });
});
