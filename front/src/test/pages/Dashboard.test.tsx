import { beforeEach, describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { Dashboard } from '../../pages/Dashboard';
import { renderWithProviders } from '../utils/renderWithProviders';
import type { DashboardResponse } from '@bon/types/dashboard';

vi.mock('../../api/dashboard', () => ({
  fetchDashboard: vi.fn(),
}));

// ── helpers ──

function createMockDashboard(overrides: Partial<DashboardResponse> = {}): DashboardResponse {
  return {
    kpis: {
      outstanding: { totalMinorUnits: 2500000, count: 8 },
      overdue: { totalMinorUnits: 420000, count: 2 },
      revenue: { thisMonthMinorUnits: 4752000, prevMonthMinorUnits: 4230000 },
      invoicesThisMonth: { count: 12, prevMonthCount: 10 },
      staleDraftCount: 0,
    },
    recentInvoices: [
      {
        id: 'inv-1',
        businessId: 'biz-1',
        customerId: 'cust-1',
        customerName: 'אלקטרה בע"מ',
        documentType: 'tax_invoice',
        status: 'paid',
        isOverdue: false,
        sequenceGroup: 'tax_document',
        documentNumber: 'INV-001',
        invoiceDate: '2026-03-10',
        dueDate: null,
        totalInclVatMinorUnits: 1240000,
        currency: 'ILS',
        createdAt: '2026-03-10T10:00:00.000Z',
      },
    ],
    overdueInvoices: [],
    hasInvoices: true,
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
  beforeEach(async () => {
    await setupMock(createMockDashboard());
  });

  it('renders KPI cards when data is loaded', async () => {
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'סקירה' })).toBeInTheDocument();
    expect(await screen.findByText('ממתין לתשלום')).toBeInTheDocument();
    expect(await screen.findByText('גבייה החודש')).toBeInTheDocument();
    expect(await screen.findByText('חשבוניות החודש')).toBeInTheDocument();
    expect((await screen.findAllByText('פגות מועד')).length).toBeGreaterThan(0);
  });

  it('renders quick actions without settings button', async () => {
    renderDashboard();

    expect(await screen.findByText('פעולות מהירות')).toBeInTheDocument();
    expect(screen.queryByText('הגדרות עסק')).not.toBeInTheDocument();
  });

  it('renders welcome state for new business', async () => {
    await setupMock(createMockDashboard({ hasInvoices: false }));

    renderDashboard();

    expect(await screen.findByText(/ברוכים הבאים/)).toBeInTheDocument();
    expect(screen.getByText('חשבונית חדשה')).toBeInTheDocument();
  });

  it('shows stale draft alert when drafts are old', async () => {
    const data = createMockDashboard();
    data.kpis.staleDraftCount = 3;
    await setupMock(data);

    renderDashboard();

    expect(await screen.findByText('3 טיוטות ממתינות להפקה')).toBeInTheDocument();
  });

  it('shows error state when API fails', async () => {
    const { fetchDashboard } = await import('../../api/dashboard');
    vi.mocked(fetchDashboard).mockRejectedValueOnce(new Error('fail'));

    renderDashboard();

    expect(await screen.findByText('שגיאה בטעינת הנתונים')).toBeInTheDocument();
  });
});
