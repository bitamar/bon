import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TenantSwitcher } from '../../components/TenantSwitcher';
import { renderWithProviders } from '../utils/renderWithProviders';

vi.mock('../../contexts/BusinessContext', () => ({ useBusiness: vi.fn() }));

import { useBusiness } from '../../contexts/BusinessContext';

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

describe('TenantSwitcher', () => {
  beforeEach(() => {
    vi.mocked(useBusiness).mockReset();
  });

  it('renders "צור עסק" button when there is no activeBusiness', () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: null,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    renderWithProviders(<TenantSwitcher />);

    expect(screen.getByRole('link', { name: 'צור עסק' })).toBeInTheDocument();
  });

  it('renders the active business name in the menu button', () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: {
        id: mockBusiness1.id,
        name: mockBusiness1.name,
        businessType: mockBusiness1.businessType,
        role: mockBusiness1.role,
      },
      businesses: [mockBusiness1],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    renderWithProviders(<TenantSwitcher />);

    expect(screen.getByRole('button', { name: /Acme Ltd/i })).toBeInTheDocument();
  });

  it('opens dropdown with business name when menu button is clicked', async () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: {
        id: mockBusiness1.id,
        name: mockBusiness1.name,
        businessType: mockBusiness1.businessType,
        role: mockBusiness1.role,
      },
      businesses: [mockBusiness1],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    renderWithProviders(<TenantSwitcher />);

    await userEvent.click(screen.getByRole('button', { name: /Acme Ltd/i }));

    expect(await screen.findByRole('menuitem', { name: /Acme Ltd/i })).toBeInTheDocument();
  });

  it('shows "נהל עסקים" link in the dropdown', async () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: {
        id: mockBusiness1.id,
        name: mockBusiness1.name,
        businessType: mockBusiness1.businessType,
        role: mockBusiness1.role,
      },
      businesses: [mockBusiness1],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    renderWithProviders(<TenantSwitcher />);

    await userEvent.click(screen.getByRole('button', { name: /Acme Ltd/i }));

    expect(await screen.findByText('נהל עסקים')).toBeInTheDocument();
  });

  it('calls switchBusiness when clicking a non-active business in the dropdown', async () => {
    const switchBusiness = vi.fn();
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: {
        id: mockBusiness1.id,
        name: mockBusiness1.name,
        businessType: mockBusiness1.businessType,
        role: mockBusiness1.role,
      },
      businesses: [mockBusiness1, mockBusiness2],
      switchBusiness,
      isLoading: false,
    });

    renderWithProviders(<TenantSwitcher />);

    await userEvent.click(screen.getByRole('button', { name: /Acme Ltd/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Beta Corp/i }));

    expect(switchBusiness).toHaveBeenCalledWith('biz-2');
  });
});
