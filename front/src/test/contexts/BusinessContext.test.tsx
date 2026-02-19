import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BusinessProvider, useBusiness } from '../../contexts/BusinessContext';
import { renderWithProviders } from '../utils/renderWithProviders';
import { suppressConsoleError } from '../utils/suppressConsoleError';

vi.mock('../../api/businesses', () => ({ fetchBusinesses: vi.fn() }));

import { fetchBusinesses } from '../../api/businesses';

const mockBusiness1 = {
  id: 'biz-1',
  name: 'Acme Ltd',
  businessType: 'licensed_dealer' as const,
  registrationNumber: '123456789',
  isActive: true,
  role: 'owner' as const,
};

const mockBusiness2 = {
  id: 'biz-2',
  name: 'Beta Corp',
  businessType: 'exempt_dealer' as const,
  registrationNumber: '987654321',
  isActive: true,
  role: 'admin' as const,
};

function TestConsumer() {
  const { activeBusiness, businesses, switchBusiness, isLoading } = useBusiness();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="active">{activeBusiness?.name ?? 'none'}</span>
      <span data-testid="count">{businesses.length}</span>
      <button onClick={() => switchBusiness('biz-2')}>switch</button>
    </div>
  );
}

function renderBusinessContext() {
  return renderWithProviders(
    <BusinessProvider>
      <TestConsumer />
    </BusinessProvider>
  );
}

function renderWithTwoBusinesses() {
  vi.mocked(fetchBusinesses).mockResolvedValue({ businesses: [mockBusiness1, mockBusiness2] });
  renderBusinessContext();
}

async function waitForFirstBusinessActive() {
  await waitFor(() => {
    expect(screen.getByTestId('active').textContent).toBe('Acme Ltd');
  });
}

describe('BusinessContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetchBusinesses).mockReset();
  });

  it('isLoading is true initially', () => {
    vi.mocked(fetchBusinesses).mockReturnValue(new Promise(() => {}));

    renderBusinessContext();

    expect(screen.getByTestId('loading').textContent).toBe('true');
  });

  it('auto-selects first business when fetchBusinesses returns a list', async () => {
    renderWithTwoBusinesses();

    await waitForFirstBusinessActive();

    expect(screen.getByTestId('count').textContent).toBe('2');
  });

  it('reads activeBusinessId from localStorage on initialization', async () => {
    localStorage.setItem('bon:activeBusiness', 'biz-2');
    renderWithTwoBusinesses();

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    // After loading, businesses are available and the active business is resolved
    expect(screen.getByTestId('count').textContent).toBe('2');
  });

  it('falls back to first business when saved localStorage id is not in list', async () => {
    localStorage.setItem('bon:activeBusiness', 'biz-unknown');
    vi.mocked(fetchBusinesses).mockResolvedValue({ businesses: [mockBusiness1, mockBusiness2] });

    renderBusinessContext();

    await waitFor(() => {
      expect(screen.getByTestId('active').textContent).toBe('Acme Ltd');
    });
  });

  it('switchBusiness updates the activeBusiness', async () => {
    vi.mocked(fetchBusinesses).mockResolvedValue({ businesses: [mockBusiness1, mockBusiness2] });

    renderBusinessContext();

    await waitFor(() => {
      expect(screen.getByTestId('active').textContent).toBe('Acme Ltd');
    });

    await userEvent.click(screen.getByRole('button', { name: 'switch' }));

    await waitFor(() => {
      expect(screen.getByTestId('active').textContent).toBe('Beta Corp');
    });
  });

  it('useBusiness throws when used outside BusinessProvider', () => {
    const restore = suppressConsoleError('useBusiness must be used within BusinessProvider');

    function NoProvider() {
      useBusiness();
      return null;
    }

    expect(() => renderWithProviders(<NoProvider />)).toThrow(
      'useBusiness must be used within BusinessProvider'
    );

    restore();
  });
});
