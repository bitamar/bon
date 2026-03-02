import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { useLocation, Route, Routes } from 'react-router-dom';
import { LegacyRedirect } from '../../components/LegacyRedirect';
import { renderWithProviders } from '../utils/renderWithProviders';

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

function renderRedirect(path: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/business/*" element={<LegacyRedirect />} />
      <Route path="/business" element={<LegacyRedirect />} />
      <Route path="/businesses" element={<div data-testid="businesses-page" />} />
      <Route path="*" element={<LocationDisplay />} />
    </Routes>,
    { router: { initialEntries: [path] } }
  );
}

describe('LegacyRedirect', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('redirects to /businesses when no businessId in localStorage', () => {
    renderRedirect('/business/dashboard');

    expect(screen.getByTestId('businesses-page')).toBeInTheDocument();
  });

  it('redirects to canonical path with stored businessId and suffix', () => {
    localStorage.setItem('bon:activeBusiness', 'biz-42');
    renderRedirect('/business/dashboard');

    expect(screen.getByTestId('location')).toHaveTextContent('/businesses/biz-42/dashboard');
  });

  it('redirects to /businesses/{id}/ when path is /business with no suffix', () => {
    localStorage.setItem('bon:activeBusiness', 'biz-99');
    renderRedirect('/business');

    expect(screen.getByTestId('location')).toHaveTextContent('/businesses/biz-99/');
  });

  it('preserves search params in the redirect', () => {
    localStorage.setItem('bon:activeBusiness', 'biz-1');
    renderWithProviders(
      <Routes>
        <Route path="/business/*" element={<LegacyRedirect />} />
        <Route path="*" element={<LocationDisplay />} />
      </Routes>,
      { router: { initialEntries: ['/business/invoices?page=2'] } }
    );

    const text = screen.getByTestId('location').textContent ?? '';
    expect(text).toContain('/businesses/biz-1/invoices');
    expect(text).toContain('page=2');
  });

  it('encodes businessId with special characters', () => {
    localStorage.setItem('bon:activeBusiness', 'biz/special');
    renderRedirect('/business/dashboard');

    const text = screen.getByTestId('location').textContent ?? '';
    expect(text).toContain('/businesses/biz%2Fspecial/dashboard');
  });
});
