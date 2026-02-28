import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { LegacyRedirect } from '../../components/LegacyRedirect';
import { renderWithProviders } from '../utils/renderWithProviders';

const ACTIVE_BUSINESS_KEY = 'bon:activeBusiness';

// ── helpers ──
function LocationDisplay() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
      {location.hash}
    </div>
  );
}

function TestHarness() {
  return (
    <Routes>
      <Route path="/business/*" element={<LegacyRedirect />} />
      <Route path="/businesses/*" element={<LocationDisplay />} />
    </Routes>
  );
}

function renderAtLegacyPath(path: string) {
  return renderWithProviders(<TestHarness />, {
    router: { initialEntries: [path] },
  });
}

describe('LegacyRedirect', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('redirects to /businesses when no active business in localStorage', () => {
    renderAtLegacyPath('/business');

    expect(screen.getByTestId('location').textContent).toBe('/businesses');
  });

  it('redirects to /businesses/{id}/path when active business exists in localStorage', () => {
    localStorage.setItem(ACTIVE_BUSINESS_KEY, 'biz-1');

    renderAtLegacyPath('/business/dashboard');

    expect(screen.getByTestId('location').textContent).toBe('/businesses/biz-1/dashboard');
  });

  it('handles paths with search params and hashes', () => {
    localStorage.setItem(ACTIVE_BUSINESS_KEY, 'biz-1');

    renderAtLegacyPath('/business/invoices?page=2#section');

    expect(screen.getByTestId('location').textContent).toBe(
      '/businesses/biz-1/invoices?page=2#section'
    );
  });
});
