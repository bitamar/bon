import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
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

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

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

  it('clicking "החלף" calls switchBusiness with correct id', async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole('button', { name: 'החלף' }));

    expect(switchBusiness).toHaveBeenCalledWith('biz-2');
  });

  it('"צור עסק חדש" card is accessible and focusable', () => {
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

    const addCard = screen.getByRole('button', { name: /צור עסק חדש/ });
    expect(addCard).toHaveAttribute('tabindex', '0');
  });

  it('clicking "ערוך" navigates to /businesses/{id}/settings', async () => {
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

    renderWithProviders(
      <>
        <BusinessList />
        <LocationDisplay />
      </>
    );

    await user.click(screen.getByRole('button', { name: 'ערוך' }));

    expect(switchBusiness).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/businesses/biz-1/settings');
  });

  it('clicking "צור עסק חדש" card navigates to /onboarding', async () => {
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

    renderWithProviders(
      <>
        <BusinessList />
        <LocationDisplay />
      </>
    );

    await user.click(screen.getByRole('button', { name: /צור עסק חדש/ }));

    expect(screen.getByTestId('location')).toHaveTextContent('/onboarding');
  });

  it('"צור עסק" button in empty state navigates to /onboarding', async () => {
    const user = userEvent.setup();

    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: null,
      businesses: [],
      switchBusiness,
      isLoading: false,
    });

    renderWithProviders(
      <>
        <BusinessList />
        <LocationDisplay />
      </>
    );

    await user.click(screen.getByRole('button', { name: 'צור עסק' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/onboarding');
  });

  it('AddBusinessCard responds to keyboard Enter by navigating to /onboarding', () => {
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

    renderWithProviders(
      <>
        <BusinessList />
        <LocationDisplay />
      </>
    );

    const addCard = screen.getByRole('button', { name: /צור עסק חדש/ });
    fireEvent.keyDown(addCard, { key: 'Enter' });

    expect(screen.getByTestId('location')).toHaveTextContent('/onboarding');
  });

  it('BusinessCard applies hover styles on mouseEnter and reverts on mouseLeave', () => {
    const business = mockBusiness({ id: 'biz-1', name: 'Test Co', role: 'owner' });

    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: null,
      businesses: [business],
      switchBusiness,
      isLoading: false,
    });

    renderWithProviders(<BusinessList />);

    const card = screen.getByText('Test Co').closest('[class*="Card"]') as HTMLElement;
    fireEvent.mouseEnter(card);
    expect(card.style.transform).toBe('translateY(-2px)');

    fireEvent.mouseLeave(card);
    expect(card.style.transform).toBe('');
  });

  it('AddBusinessCard applies hover styles on mouseEnter and reverts on mouseLeave', () => {
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

    const addCard = screen.getByRole('button', { name: /צור עסק חדש/ });
    fireEvent.mouseEnter(addCard);
    expect(addCard.style.borderColor).toBe('var(--mantine-color-brand-4)');

    fireEvent.mouseLeave(addCard);
    expect(addCard.style.borderColor).toBe('var(--mantine-color-gray-3)');
  });
});
