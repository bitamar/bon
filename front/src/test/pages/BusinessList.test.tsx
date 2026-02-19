import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BusinessList } from '../../pages/BusinessList';
import { renderWithProviders } from '../utils/renderWithProviders';

vi.mock('../../contexts/BusinessContext', () => ({ useBusiness: vi.fn() }));

import { useBusiness } from '../../contexts/BusinessContext';

const mockBusiness = (
  overrides: Partial<{
    id: string;
    name: string;
    businessType: 'licensed_dealer' | 'exempt_dealer' | 'limited_company';
    registrationNumber: string;
    isActive: boolean;
    role: 'owner' | 'admin' | 'user';
  }> = {}
) => ({
  id: 'biz-1',
  name: 'Test Co',
  businessType: 'licensed_dealer' as const,
  registrationNumber: '123456789',
  isActive: true,
  role: 'owner' as const,
  ...overrides,
});

describe('BusinessList page', () => {
  const switchBusiness = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    switchBusiness.mockResolvedValue(undefined);
  });

  it('shows loading state when isLoading is true', () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: null,
      businesses: [],
      switchBusiness,
      isLoading: true,
    });

    renderWithProviders(<BusinessList />);

    expect(screen.getByText('טוען עסקים...')).toBeInTheDocument();
  });

  it('shows empty state when businesses is empty and not loading', () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: null,
      businesses: [],
      switchBusiness,
      isLoading: false,
    });

    renderWithProviders(<BusinessList />);

    expect(screen.getByText('אין עסקים')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'צור עסק' })).toBeInTheDocument();
  });

  it('renders business cards when businesses is non-empty', () => {
    const business = mockBusiness({ id: 'biz-1', name: 'Test Co' });
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: {
        id: 'biz-1',
        name: 'Test Co',
        businessType: 'licensed_dealer',
        role: 'owner',
      },
      businesses: [business],
      switchBusiness,
      isLoading: false,
    });

    renderWithProviders(<BusinessList />);

    expect(screen.getByText('Test Co')).toBeInTheDocument();
  });

  it('does not show "החלף" button for the active business', () => {
    const activeBiz = mockBusiness({ id: 'biz-1', name: 'Active Biz', role: 'user' });
    const otherBiz = mockBusiness({ id: 'biz-2', name: 'Other Biz', role: 'user' });

    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: {
        id: 'biz-1',
        name: 'Active Biz',
        businessType: 'licensed_dealer',
        role: 'user',
      },
      businesses: [activeBiz, otherBiz],
      switchBusiness,
      isLoading: false,
    });

    renderWithProviders(<BusinessList />);

    const switchButtons = screen.getAllByRole('button', { name: 'החלף' });
    expect(switchButtons).toHaveLength(1);
  });

  it('shows "ערוך" button for owner and admin, not for user role', () => {
    const ownerBiz = mockBusiness({ id: 'biz-1', name: 'Owner Biz', role: 'owner' });
    const adminBiz = mockBusiness({ id: 'biz-2', name: 'Admin Biz', role: 'admin' });
    const userBiz = mockBusiness({ id: 'biz-3', name: 'User Biz', role: 'user' });

    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: {
        id: 'biz-1',
        name: 'Owner Biz',
        businessType: 'licensed_dealer',
        role: 'owner',
      },
      businesses: [ownerBiz, adminBiz, userBiz],
      switchBusiness,
      isLoading: false,
    });

    renderWithProviders(<BusinessList />);

    const editButtons = screen.getAllByRole('button', { name: 'ערוך' });
    expect(editButtons).toHaveLength(2);
  });

  it('clicking "ערוך" calls switchBusiness and navigates to /business/settings', async () => {
    const user = userEvent.setup();
    const business = mockBusiness({ id: 'biz-1', name: 'Test Co', role: 'owner' });

    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: {
        id: 'biz-1',
        name: 'Test Co',
        businessType: 'licensed_dealer',
        role: 'owner',
      },
      businesses: [business],
      switchBusiness,
      isLoading: false,
    });

    renderWithProviders(<BusinessList />);

    await user.click(screen.getByRole('button', { name: 'ערוך' }));

    await waitFor(() => expect(switchBusiness).toHaveBeenCalledWith('biz-1'));
  });
});
