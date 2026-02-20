import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Login } from '../../pages/Login';
import { renderWithProviders } from '../utils/renderWithProviders';
import { AuthProvider, useAuth } from '../../auth/AuthContext';

vi.mock('../../auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../auth/AuthContext')>();
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

describe('Login page', () => {
  const useAuthMock = vi.mocked(useAuth);

  it('renders login card when user is not authenticated', () => {
    const loginWithGoogle = vi.fn();
    useAuthMock.mockReturnValue({
      user: null,
      loginWithGoogle,
      logout: vi.fn(),
      isHydrated: true,
    } as ReturnType<typeof useAuth>);

    renderWithProviders(
      <AuthProvider>
        <Login />
      </AuthProvider>
    );

    expect(screen.getByText('bon')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /כניסה עם Google/i });
    expect(button).toBeInTheDocument();
    button.click();
    expect(loginWithGoogle).toHaveBeenCalled();
  });

  it('redirects to dashboard if user exists', () => {
    useAuthMock.mockReturnValue({
      user: { id: '1', email: 'test@example.com', name: 'Tester', avatarUrl: null, phone: null },
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      isHydrated: true,
    } as ReturnType<typeof useAuth>);

    renderWithProviders(
      <AuthProvider>
        <Login />
      </AuthProvider>
    );

    expect(screen.queryByRole('button', { name: /כניסה עם Google/i })).not.toBeInTheDocument();
  });
});
