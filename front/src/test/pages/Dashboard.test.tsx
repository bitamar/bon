import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Dashboard } from '../../pages/Dashboard';
import { renderWithProviders } from '../utils/renderWithProviders';
import * as dashboardDataModule from '../../hooks/useDashboardData';
import { createMockDashboardData } from '../utils/mockDashboardData';

vi.mock('../../hooks/useDashboardData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useDashboardData')>();
  return { ...actual, useDashboardData: vi.fn() };
});

const useDashboardDataMock = vi.mocked(dashboardDataModule.useDashboardData);

describe('Dashboard page', () => {
  it('renders KPI cards and sections when data is loaded', () => {
    const mockData = createMockDashboardData();
    useDashboardDataMock.mockReturnValue({ data: mockData, isLoading: false, error: null });

    renderWithProviders(<Dashboard />);

    expect(screen.getByRole('heading', { name: 'ראשי' })).toBeInTheDocument();
    expect(screen.getByText('הכנסות החודש')).toBeInTheDocument();
    expect(screen.getByText('חשבוניות פתוחות')).toBeInTheDocument();
    expect(screen.getByText('לקוחות פעילים')).toBeInTheDocument();
    expect(screen.getByText('ממוצע לחשבונית')).toBeInTheDocument();
  });

  it('renders quick actions section', () => {
    const mockData = createMockDashboardData();
    useDashboardDataMock.mockReturnValue({ data: mockData, isLoading: false, error: null });

    renderWithProviders(<Dashboard />);

    expect(screen.getByText('פעולות מהירות')).toBeInTheDocument();
    expect(screen.getByText('הגדרות עסק')).toBeInTheDocument();
  });

  it('renders loading skeletons when loading', () => {
    useDashboardDataMock.mockReturnValue({ data: undefined, isLoading: true, error: null });

    const { container } = renderWithProviders(<Dashboard />);

    const skeletons = container.querySelectorAll('[data-visible="true"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error state when error occurs', () => {
    useDashboardDataMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('fail'),
    });

    renderWithProviders(<Dashboard />);

    expect(screen.getByText('שגיאה בטעינת הנתונים')).toBeInTheDocument();
  });
});
