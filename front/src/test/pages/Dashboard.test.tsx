import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { Dashboard } from '../../pages/Dashboard';
import { renderWithProviders } from '../utils/renderWithProviders';
import type { DashboardResponse } from '@bon/types/dashboard';

vi.mock('../../api/dashboard', () => ({
  fetchDashboard: vi.fn(),
}));

import * as dashboardApi from '../../api/dashboard';

// ── helpers ──

function makeDashboardData(overrides: Partial<DashboardResponse> = {}): DashboardResponse {
  return {
    revenueThisMonthMinorUnits: 4752000,
    revenuePrevMonthMinorUnits: 3800000,
    invoiceCountThisMonth: 12,
    invoiceCountPrevMonth: 10,
    outstandingAmountMinorUnits: 1500000,
    outstandingCount: 5,
    overdueAmountMinorUnits: 300000,
    overdueCount: 2,
    shaamPendingCount: 0,
    shaamRejectedCount: 0,
    recentInvoices: [],
    ...overrides,
  };
}

function renderDashboard() {
  return renderWithProviders(
    <Routes>
      <Route path="/businesses/:businessId/dashboard" element={<Dashboard />} />
    </Routes>,
    { router: { initialEntries: ['/businesses/biz-1/dashboard'] } }
  );
}

async function setupMock(data: DashboardResponse) {
  const { fetchDashboard } = await import('../../api/dashboard');
  vi.mocked(fetchDashboard).mockResolvedValue(data);
}

describe('Dashboard page', () => {
  it('renders KPI cards when data is loaded', async () => {
    vi.mocked(dashboardApi.fetchDashboard).mockResolvedValue(makeDashboardData());

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('הכנסות החודש')).toBeInTheDocument();
    });
    expect(screen.getByText('חשבוניות החודש')).toBeInTheDocument();
    expect(screen.getByText('ממתין לתשלום')).toBeInTheDocument();
    expect(screen.getByText('פגות מועד')).toBeInTheDocument();
  });

  it('renders quick actions section', async () => {
    vi.mocked(dashboardApi.fetchDashboard).mockResolvedValue(makeDashboardData());

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('פעולות מהירות')).toBeInTheDocument();
    });
  });

  it('renders loading skeletons while loading', () => {
    vi.mocked(dashboardApi.fetchDashboard).mockReturnValue(new Promise(() => {}));

    const { container } = renderDashboard();

    const skeletons = container.querySelectorAll('[data-visible="true"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error state when fetch fails', async () => {
    vi.mocked(dashboardApi.fetchDashboard).mockRejectedValue(new Error('fail'));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('שגיאה בטעינת הנתונים')).toBeInTheDocument();
    });
  });

  it('renders empty invoices state when no recent invoices', async () => {
    vi.mocked(dashboardApi.fetchDashboard).mockResolvedValue(
      makeDashboardData({ recentInvoices: [] })
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('אין חשבוניות להצגה')).toBeInTheDocument();
    });
  });

  it('hides SHAAM status card when counts are zero', async () => {
    vi.mocked(dashboardApi.fetchDashboard).mockResolvedValue(
      makeDashboardData({ shaamPendingCount: 0, shaamRejectedCount: 0 })
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('הכנסות החודש')).toBeInTheDocument();
    });
    expect(screen.queryByText('סטטוס שע"מ')).not.toBeInTheDocument();
  });

  it('shows SHAAM status card when there are pending allocations', async () => {
    vi.mocked(dashboardApi.fetchDashboard).mockResolvedValue(
      makeDashboardData({ shaamPendingCount: 3, shaamRejectedCount: 1 })
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('3 בקשות ממתינות להקצאה')).toBeInTheDocument();
    });
    expect(screen.getByText('1 בקשות נדחו')).toBeInTheDocument();
  });
});
