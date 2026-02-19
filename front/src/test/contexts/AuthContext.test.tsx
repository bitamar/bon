import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../../auth/AuthContext';
import { renderWithProviders } from '../utils/renderWithProviders';
import { suppressConsoleError } from '../utils/suppressConsoleError';

vi.mock('../../auth/api', () => ({
  getMe: vi.fn(),
  logout: vi.fn(),
  getGoogleLoginUrl: vi.fn().mockReturnValue('https://google.com/auth'),
}));

import { getMe, logout as apiLogout } from '../../auth/api';

function TestConsumer() {
  const { user, isHydrated, loginWithGoogle, logout } = useAuth();
  return (
    <div>
      <span data-testid="hydrated">{String(isHydrated)}</span>
      <span data-testid="user">{user?.email ?? 'null'}</span>
      <button onClick={loginWithGoogle}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.mocked(getMe).mockReset();
    vi.mocked(apiLogout).mockReset();
  });

  it('isHydrated starts false and becomes true after query resolves', async () => {
    vi.mocked(getMe).mockResolvedValue(null);

    renderWithProviders(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId('hydrated').textContent).toBe('false');

    await waitFor(() => {
      expect(screen.getByTestId('hydrated').textContent).toBe('true');
    });
  });

  it('user is null when getMe returns null', async () => {
    vi.mocked(getMe).mockResolvedValue(null);

    renderWithProviders(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('hydrated').textContent).toBe('true');
    });

    expect(screen.getByTestId('user').textContent).toBe('null');
  });

  it('user is set to user data when getMe returns a user', async () => {
    vi.mocked(getMe).mockResolvedValue({
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'a@b.com',
        name: 'Test User',
        avatarUrl: null,
        phone: null,
      },
    });

    renderWithProviders(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('a@b.com');
    });
  });

  it('loginWithGoogle sets location.href', async () => {
    vi.mocked(getMe).mockResolvedValue(null);

    const originalLocation = globalThis.location;
    const locationSpy = vi.spyOn(globalThis, 'location', 'get');
    let capturedHref = '';
    locationSpy.mockReturnValue({
      ...originalLocation,
      set href(val: string) {
        capturedHref = val;
      },
      get href() {
        return capturedHref;
      },
    } as Location);

    renderWithProviders(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: 'login' }));

    expect(capturedHref).toBe('https://google.com/auth');

    locationSpy.mockRestore();
  });

  it('logout calls apiLogout and clears query data', async () => {
    vi.mocked(getMe).mockResolvedValue(null);
    vi.mocked(apiLogout).mockResolvedValue(undefined);

    renderWithProviders(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('hydrated').textContent).toBe('true');
    });

    await userEvent.click(screen.getByRole('button', { name: 'logout' }));

    expect(apiLogout).toHaveBeenCalledTimes(1);
  });

  it('useAuth throws when used outside AuthProvider', () => {
    const restore = suppressConsoleError('useAuth must be used within AuthProvider');

    function NoProvider() {
      useAuth();
      return null;
    }

    expect(() => renderWithProviders(<NoProvider />)).toThrow(
      'useAuth must be used within AuthProvider'
    );

    restore();
  });
});
