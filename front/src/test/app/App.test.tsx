import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
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
};

vi.mock('../../auth/api');
vi.mock('../../api/businesses', () => ({
  fetchBusinesses: vi.fn(),
  fetchBusiness: vi.fn(),
  createBusiness: vi.fn(),
  updateBusiness: vi.fn(),
}));

import * as businessesApi from '../../api/businesses';

// ── helpers ──

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

describe('App routing', () => {
  const getMeMock = vi.mocked(authApi.getMe);
  const fetchBusinessesMock = vi.mocked(businessesApi.fetchBusinesses);

  beforeEach(() => {
    getMeMock.mockResolvedValue({ user: mockUser });
    fetchBusinessesMock.mockResolvedValue({
      businesses: [
        {
          id: 'biz-1',
          name: 'Test Co',
          businessType: 'licensed_dealer',
          registrationNumber: '123456782',
          isActive: true,
          role: 'owner',
        },
      ],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
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

  it('redirects to landing page when unauthenticated', async () => {
    getMeMock.mockResolvedValueOnce(null);

    renderApp();

    await waitFor(() => expect(screen.getByText('חשבונית מס')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: /מחירים/ })).toBeInTheDocument();
  });

  it('shows landing page at /welcome', async () => {
    getMeMock.mockResolvedValueOnce(null);

    renderApp('/welcome');

    await waitFor(() => expect(screen.getByText('חשבונית מס')).toBeInTheDocument());
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
    await waitFor(() => expect(screen.getByText('חשבונית מס')).toBeInTheDocument());
  });

  describe('HomeRedirect', () => {
    it('redirects to /onboarding when no businesses exist', async () => {
      fetchBusinessesMock.mockResolvedValue({ businesses: [] });

      renderWithProviders(
        <>
          <App />
          <LocationDisplay />
        </>,
        { router: { initialEntries: ['/'] } }
      );

      // HomeRedirect → /businesses → OnboardingGuard → /onboarding
      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/onboarding'));
    });

    it('redirects to /businesses/{id}/dashboard when activeBusiness exists', async () => {
      renderWithProviders(
        <>
          <App />
          <LocationDisplay />
        </>,
        { router: { initialEntries: ['/'] } }
      );

      await waitFor(() =>
        expect(screen.getByTestId('location')).toHaveTextContent('/businesses/biz-1/dashboard')
      );
    });
  });

  describe('OnboardingGuard', () => {
    it('redirects to /onboarding when authenticated user has no businesses', async () => {
      fetchBusinessesMock.mockResolvedValue({ businesses: [] });

      renderWithProviders(
        <>
          <App />
          <LocationDisplay />
        </>,
        { router: { initialEntries: ['/businesses'] } }
      );

      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/onboarding'));
    });
  });
});
