import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
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

const switchBusiness = vi.fn();

function mockBusinessContext(overrides: Partial<ReturnType<typeof useBusiness>> = {}) {
  vi.mocked(useBusiness).mockReturnValue({
    activeBusiness: null,
    businesses: [],
    switchBusiness,
    isLoading: false,
    ...overrides,
  });
}

function mockSingleOwnerBusinessContext() {
  const business = mockBusiness({ id: 'biz-1', name: 'Test Co', role: 'owner' });
  mockBusinessContext({
    activeBusiness: {
      id: 'biz-1',
      name: 'Test Co',
      businessType: 'licensed_dealer',
      role: 'owner',
    },
    businesses: [business],
  });
  return business;
}

function renderWithLocation() {
  return renderWithProviders(
    <>
      <BusinessList />
      <LocationDisplay />
    </>
  );
}

describe('BusinessList page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    switchBusiness.mockResolvedValue(undefined);
  });

  it('shows loading state when isLoading is true', () => {
    mockBusinessContext({ isLoading: true });

    renderWithProviders(<BusinessList />);

    expect(screen.getByText('טוען עסקים...')).toBeInTheDocument();
  });

  it('shows empty state when businesses is empty and not loading', () => {
    mockBusinessContext();

    renderWithProviders(<BusinessList />);

    expect(screen.getByText('אין עסקים')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'צור עסק' })).toBeInTheDocument();
  });

  it('renders business cards when businesses is non-empty', () => {
    const business = mockBusiness({ id: 'biz-1', name: 'Test Co' });
    mockBusinessContext({
      activeBusiness: {
        id: 'biz-1',
        name: 'Test Co',
        businessType: 'licensed_dealer',
        role: 'owner',
      },
      businesses: [business],
    });

    renderWithProviders(<BusinessList />);

    expect(screen.getByText('Test Co')).toBeInTheDocument();
  });

  it('does not show "החלף" button for the active business', () => {
    const activeBiz = mockBusiness({ id: 'biz-1', name: 'Active Biz', role: 'user' });
    const otherBiz = mockBusiness({ id: 'biz-2', name: 'Other Biz', role: 'user' });

    mockBusinessContext({
      activeBusiness: {
        id: 'biz-1',
        name: 'Active Biz',
        businessType: 'licensed_dealer',
        role: 'user',
      },
      businesses: [activeBiz, otherBiz],
    });

    renderWithProviders(<BusinessList />);

    const switchButtons = screen.getAllByRole('button', { name: 'החלף' });
    expect(switchButtons).toHaveLength(1);
  });

  it('shows "ערוך" button for owner and admin, not for user role', () => {
    const ownerBiz = mockBusiness({ id: 'biz-1', name: 'Owner Biz', role: 'owner' });
    const adminBiz = mockBusiness({ id: 'biz-2', name: 'Admin Biz', role: 'admin' });
    const userBiz = mockBusiness({ id: 'biz-3', name: 'User Biz', role: 'user' });

    mockBusinessContext({
      activeBusiness: {
        id: 'biz-1',
        name: 'Owner Biz',
        businessType: 'licensed_dealer',
        role: 'owner',
      },
      businesses: [ownerBiz, adminBiz, userBiz],
    });

    renderWithProviders(<BusinessList />);

    const editButtons = screen.getAllByRole('button', { name: 'ערוך' });
    expect(editButtons).toHaveLength(2);
  });

  it('clicking "החלף" calls switchBusiness with correct id', async () => {
    const user = userEvent.setup();
    const activeBiz = mockBusiness({ id: 'biz-1', name: 'Active Biz', role: 'user' });
    const otherBiz = mockBusiness({ id: 'biz-2', name: 'Other Biz', role: 'user' });

    mockBusinessContext({
      activeBusiness: {
        id: 'biz-1',
        name: 'Active Biz',
        businessType: 'licensed_dealer',
        role: 'user',
      },
      businesses: [activeBiz, otherBiz],
    });

    renderWithProviders(<BusinessList />);

    await user.click(screen.getByRole('button', { name: 'החלף' }));

    expect(switchBusiness).toHaveBeenCalledWith('biz-2');
  });

  it('"צור עסק חדש" card is accessible and focusable', () => {
    mockSingleOwnerBusinessContext();

    renderWithProviders(<BusinessList />);

    const addCard = screen.getByRole('button', { name: /צור עסק חדש/ });
    expect(addCard).toHaveAttribute('tabindex', '0');
  });

  it('clicking "צור עסק" in empty state navigates to /onboarding', async () => {
    const user = userEvent.setup();
    mockBusinessContext();

    renderWithLocation();

    await user.click(screen.getByRole('button', { name: 'צור עסק' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/onboarding');
  });

  it('clicking AddBusinessCard navigates to /onboarding', async () => {
    const user = userEvent.setup();
    mockSingleOwnerBusinessContext();

    renderWithLocation();

    await user.click(screen.getByRole('button', { name: /צור עסק חדש/ }));

    expect(screen.getByTestId('location')).toHaveTextContent('/onboarding');
  });

  it('AddBusinessCard responds to Enter keydown', async () => {
    const user = userEvent.setup();
    mockSingleOwnerBusinessContext();

    renderWithLocation();

    const addCard = screen.getByRole('button', { name: /צור עסק חדש/ });
    addCard.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('location')).toHaveTextContent('/onboarding');
  });

  it('shows "עסק פעיל" badge for the active business', () => {
    mockSingleOwnerBusinessContext();

    renderWithProviders(<BusinessList />);

    expect(screen.getByText('עסק פעיל')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'החלף' })).not.toBeInTheDocument();
  });

  it('fires mouse and keyboard events on cards without errors', () => {
    const activeBiz = mockBusiness({ id: 'biz-1', name: 'Active Biz', role: 'owner' });
    const inactiveBiz = mockBusiness({ id: 'biz-2', name: 'Inactive Biz', role: 'user' });

    mockBusinessContext({
      activeBusiness: {
        id: 'biz-1',
        name: 'Active Biz',
        businessType: 'licensed_dealer',
        role: 'owner',
      },
      businesses: [activeBiz, inactiveBiz],
    });

    renderWithLocation();

    // Fire mouse events on all pointer-cursor elements to cover onMouseEnter/onMouseLeave handlers
    const pointerEls = Array.from(document.querySelectorAll<HTMLElement>('[style*="cursor"]'));
    pointerEls.forEach((el) => {
      fireEvent.mouseEnter(el);
      fireEvent.mouseLeave(el);
    });

    // Fire keyboard events on AddBusinessCard to cover onKeyDown handler
    const addCard = screen.getByRole('button', { name: /צור עסק חדש/ });

    // Tab should NOT trigger navigation
    fireEvent.keyDown(addCard, { key: 'Tab' });
    expect(screen.getByTestId('location')).not.toHaveTextContent('/onboarding');

    // Enter and Space trigger onClick (smoke coverage)
    fireEvent.keyDown(addCard, { key: 'Enter' });
    fireEvent.keyDown(addCard, { key: ' ' });

    // Both business names still visible
    expect(screen.getByText('Active Biz')).toBeInTheDocument();
    expect(screen.getByText('Inactive Biz')).toBeInTheDocument();
  });

  it('clicking "ערוך" navigates to /businesses/{id}/settings', async () => {
    const user = userEvent.setup();
    mockSingleOwnerBusinessContext();

    renderWithLocation();

    await user.click(screen.getByRole('button', { name: 'ערוך' }));

    expect(switchBusiness).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/businesses/biz-1/settings');
  });
});
