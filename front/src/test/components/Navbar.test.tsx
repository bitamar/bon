import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import Navbar from '../../Navbar';
import { renderWithProviders } from '../utils/renderWithProviders';
import { AppShell } from '@mantine/core';
import { useAuth } from '../../auth/AuthContext';
import { useBusiness } from '../../contexts/BusinessContext';

vi.mock('../../auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../auth/AuthContext')>();
  return { ...actual, useAuth: vi.fn() };
});

vi.mock('../../contexts/BusinessContext', () => ({
  useBusiness: vi.fn(),
}));

// ── helpers ──
function setupMocks() {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: '1', name: 'Test User', email: 'test@example.com', avatarUrl: null, phone: null },
    logout: vi.fn(),
    loginWithGoogle: vi.fn(),
    isHydrated: true,
  } as ReturnType<typeof useAuth>);

  vi.mocked(useBusiness).mockReturnValue({
    activeBusiness: {
      id: 'biz-1',
      name: 'Test Co',
      businessType: 'licensed_dealer',
      role: 'owner',
    },
    businesses: [],
    switchBusiness: vi.fn(),
    isLoading: false,
  });
}

describe('Navbar', () => {
  it('renders navigation links', () => {
    setupMocks();
    renderWithProviders(
      <AppShell navbar={{ width: 260, breakpoint: 'sm' }}>
        <Navbar />
      </AppShell>
    );

    expect(screen.getByText('ראשי')).toBeInTheDocument();
    expect(screen.getByText('הגדרות')).toBeInTheDocument();
    expect(screen.getByText('לקוחות')).toBeInTheDocument();
    expect(screen.getByText('חשבוניות')).toBeInTheDocument();
  });

  it('renders user section with name and business', () => {
    setupMocks();
    renderWithProviders(
      <AppShell navbar={{ width: 260, breakpoint: 'sm' }}>
        <Navbar />
      </AppShell>
    );

    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('Test Co')).toBeInTheDocument();
  });
});
