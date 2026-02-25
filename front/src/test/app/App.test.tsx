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
};

vi.mock('../../auth/api');
describe('App routing', () => {
  const getMeMock = vi.mocked(authApi.getMe);

  beforeEach(() => {
    getMeMock.mockResolvedValue({ user: mockUser });
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

  it('renders protected dashboard when authenticated at /dashboard', async () => {
    renderApp('/dashboard');

    await waitFor(() => expect(screen.getAllByText('ראשי')[0]).toBeInTheDocument());
    expect(screen.getAllByText('bon')[0]).toBeInTheDocument();
  });

  it('redirects authenticated user from / to /dashboard', async () => {
    renderApp('/');

    await waitFor(() => expect(screen.getAllByText('ראשי')[0]).toBeInTheDocument());
  });

  it('shows landing page when unauthenticated at /', async () => {
    getMeMock.mockResolvedValueOnce(null);

    renderApp('/');

    await waitFor(() => expect(screen.getByText('חשבונית מס')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: /מחירים/ })).toBeInTheDocument();
  });

  it('shows login page when unauthenticated at /login', async () => {
    getMeMock.mockResolvedValueOnce(null);

    renderApp('/login');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /כניסה עם Google/i })).toBeInTheDocument()
    );
  });

  it('shows loader before hydration completes on protected routes', async () => {
    let resolveGetMe: ((value: { user: typeof mockUser } | null) => void) | undefined;
    getMeMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveGetMe = resolve;
        })
    );

    renderApp('/dashboard');

    expect(screen.getByLabelText('Loading user')).toBeInTheDocument();

    resolveGetMe?.(null);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /כניסה עם Google/i })).toBeInTheDocument()
    );
  });
});
