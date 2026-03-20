import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import App from '../../App';
import * as authApi from '../../auth/api';
import type { User as AuthUser } from '@bon/types/users';
import { renderWithProviders } from '../utils/renderWithProviders';

const mockUser: AuthUser = {
  id: '1',
  email: 'test@example.com',
  name: 'Test User',
  avatarUrl: null,
  phone: null,
  whatsappEnabled: true,
};

vi.mock('../../auth/api');
vi.mock('../../api/businesses', () => ({
  fetchBusinesses: vi.fn(),
  fetchBusiness: vi.fn(),
  updateBusiness: vi.fn(),
  createBusiness: vi.fn(),
}));
vi.mock('../../api/dashboard', () => ({
  fetchDashboard: vi.fn(),
}));

import * as businessesApi from '../../api/businesses';
import * as dashboardApi from '../../api/dashboard';

const mockBizItem = {
  id: 'biz-1',
  name: 'Test Co',
  businessType: 'licensed_dealer' as const,
  registrationNumber: '123456789',
  isActive: true,
  role: 'owner' as const,
};

describe('App routing', () => {
  const getMeMock = vi.mocked(authApi.getMe);

  beforeEach(() => {
    getMeMock.mockResolvedValue({ user: mockUser });
    vi.mocked(businessesApi.fetchBusinesses).mockResolvedValue({ businesses: [] });
    vi.mocked(dashboardApi.fetchDashboard).mockResolvedValue({
      revenueThisMonthMinorUnits: 0,
      revenuePrevMonthMinorUnits: 0,
      invoiceCountThisMonth: 0,
      invoiceCountPrevMonth: 0,
      outstandingAmountMinorUnits: 0,
      outstandingCount: 0,
      overdueAmountMinorUnits: 0,
      overdueCount: 0,
      shaamPendingCount: 0,
      shaamRejectedCount: 0,
      recentInvoices: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  function renderApp(path = '/') {
    return renderWithProviders(<App />, {
      router: {
        initialEntries: [path],
      },
    });
  }

  it('renders protected dashboard when authenticated', async () => {
    renderApp();

    await waitFor(() => expect(screen.getAllByText('ראשי')[0]).toBeInTheDocument());
    expect(screen.getAllByText('bon')[0]).toBeInTheDocument();
  });

  it('redirects to login page when unauthenticated', async () => {
    getMeMock.mockResolvedValueOnce(null);

    renderApp();

    await waitFor(() => expect(screen.getByText('כניסה עם Google')).toBeInTheDocument());
  });

  it('shows loader before hydration completes', async () => {
    let resolveGetMe: ((value: { user: typeof mockUser } | null) => void) | undefined;
    getMeMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveGetMe = resolve;
        })
    );

    renderApp();

    expect(screen.getByLabelText('Loading user')).toBeInTheDocument();

    resolveGetMe?.(null);
    await waitFor(() => expect(screen.getByText('כניסה עם Google')).toBeInTheDocument());
  });

  it('OnboardingGuard redirects to /onboarding when no businesses', async () => {
    // businesses is [] → OnboardingGuard navigates to /onboarding
    vi.mocked(businessesApi.fetchBusinesses).mockResolvedValue({ businesses: [] });

    renderApp('/settings');

    // The Onboarding page should render after the redirect
    await waitFor(() => {
      expect(screen.getByText('יצירת העסק שלך')).toBeInTheDocument();
    });
  });

  it('HomeRedirect navigates to active business dashboard when activeBusiness is set', async () => {
    // Put an active business in localStorage so HomeRedirect can navigate to it
    localStorage.setItem('bon:activeBusiness', 'biz-1');
    vi.mocked(businessesApi.fetchBusinesses).mockResolvedValue({ businesses: [mockBizItem] });

    renderApp('/');

    // After businesses load, OnboardingGuard allows through → HomeRedirect runs and
    // navigates to /businesses/biz-1/dashboard → Dashboard renders with a heading 'דאשבורד'
    await screen.findByRole('heading', { name: 'דאשבורד' });
  });
});
