import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { Dashboard } from '../../pages/Dashboard';
import { renderWithProviders } from '../utils/renderWithProviders';
import * as dashboardDataModule from '../../hooks/useDashboardData';
import { createMockDashboardData } from '../utils/mockDashboardData';

vi.mock('../../hooks/useDashboardData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useDashboardData')>();
  return { ...actual, useDashboardData: vi.fn() };
});

const useDashboardDataMock = vi.mocked(dashboardDataModule.useDashboardData);

// ── helpers ──

function renderDashboard() {
  return renderWithProviders(
    <Routes>
      <Route path="/businesses/:businessId/dashboard" element={<Dashboard />} />
    </Routes>,
    { router: { initialEntries: ['/businesses/biz-1/dashboard'] } }
  );
}

describe('Dashboard page', () => {
  it('renders KPI cards and sections when data is loaded', () => {
    const mockData = createMockDashboardData();
    useDashboardDataMock.mockReturnValue({ data: mockData, isLoading: false, error: null });

    renderDashboard();

    expect(screen.getByRole('heading', { name: 'ראשי' })).toBeInTheDocument();
    expect(screen.getByText('הכנסות החודש')).toBeInTheDocument();
    expect(screen.getByText('חשבוניות פתוחות')).toBeInTheDocument();
    expect(screen.getByText('לקוחות פעילים')).toBeInTheDocument();
    expect(screen.getByText('ממוצע לחשבונית')).toBeInTheDocument();
  });

  it('renders quick actions section', () => {
    const mockData = createMockDashboardData();
    useDashboardDataMock.mockReturnValue({ data: mockData, isLoading: false, error: null });

    renderDashboard();

    expect(screen.getByText('פעולות מהירות')).toBeInTheDocument();
    expect(screen.getByText('הגדרות עסק')).toBeInTheDocument();
  });

  it('renders loading skeletons when loading', () => {
    useDashboardDataMock.mockReturnValue({ data: undefined, isLoading: true, error: null });

    const { container } = renderDashboard();

    const skeletons = container.querySelectorAll('[data-visible="true"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error state when error occurs', () => {
    useDashboardDataMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('fail'),
    });

    renderDashboard();

    expect(screen.getByText('שגיאה בטעינת הנתונים')).toBeInTheDocument();
  });
});
