import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import Header from '../../Header';
import { AuthProvider, useAuth } from '../../auth/AuthContext';
import { renderWithProviders } from '../utils/renderWithProviders';
import { AppShell } from '@mantine/core';

vi.mock('../../auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../auth/AuthContext')>();
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

describe('Header', () => {
  const useAuthMock = vi.mocked(useAuth);

  it('renders user name and logout menu', () => {
    useAuthMock.mockReturnValue({
      user: {
        id: '1',
        name: 'Sample User',
        email: 'user@example.com',
        avatarUrl: null,
        phone: null,
      },
      logout: vi.fn(),
      loginWithGoogle: vi.fn(),
      isHydrated: true,
    } as ReturnType<typeof useAuth>);

    const setOpened = vi.fn();
    renderWithProviders(
      <AuthProvider>
        <AppShell header={{ height: 64 }}>
          <AppShell.Header>
            <Header opened={false} setOpened={setOpened} />
          </AppShell.Header>
        </AppShell>
      </AuthProvider>
    );

    expect(screen.getByText('Sample User')).toBeInTheDocument();

    const burgerButton = screen
      .getAllByRole('button')
      .find((button) => button.className.includes('Burger'));
    if (!burgerButton) throw new Error('Burger button not found');
    fireEvent.click(burgerButton);
    expect(setOpened).toHaveBeenCalledWith(expect.any(Function));
  });

  it('falls back to user email when name is missing', () => {
    useAuthMock.mockReturnValue({
      user: {
        id: '2',
        name: null,
        email: 'fallback@example.com',
        avatarUrl: null,
        phone: null,
      },
      logout: vi.fn(),
      loginWithGoogle: vi.fn(),
      isHydrated: true,
    } as ReturnType<typeof useAuth>);

    renderWithProviders(
      <AuthProvider>
        <AppShell header={{ height: 64 }}>
          <AppShell.Header>
            <Header opened={false} setOpened={vi.fn()} />
          </AppShell.Header>
        </AppShell>
      </AuthProvider>
    );

    expect(screen.getByText('fallback@example.com')).toBeInTheDocument();
  });
});
