import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeamManagement } from '../../pages/TeamManagement';
import { renderWithProviders } from '../utils/renderWithProviders';

vi.mock('../../contexts/BusinessContext', () => ({ useBusiness: vi.fn() }));
vi.mock('../../api/businesses', () => ({
  fetchTeamMembers: vi.fn(),
  removeTeamMember: vi.fn(),
}));
vi.mock('../../api/invitations', () => ({
  createInvitation: vi.fn(),
}));

import { useBusiness } from '../../contexts/BusinessContext';
import * as businessesApi from '../../api/businesses';
import * as invitationsApi from '../../api/invitations';

const activeBusinessStub = {
  id: 'biz-1',
  name: 'Test Co',
  businessType: 'licensed_dealer',
  role: 'owner',
};

const teamListResponse = {
  team: [
    {
      userId: 'u-1',
      name: 'Alice',
      email: 'alice@example.com',
      avatarUrl: null,
      role: 'owner' as const,
      joinedAt: '2024-01-01T00:00:00.000Z',
    },
  ],
};

const teamListWithNonOwner = {
  team: [
    ...teamListResponse.team,
    {
      userId: 'u-2',
      name: 'Bob',
      email: 'bob@example.com',
      avatarUrl: null,
      role: 'user' as const,
      joinedAt: '2024-01-02T00:00:00.000Z',
    },
  ],
};

describe('TeamManagement page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows "לא נבחר עסק" when no activeBusiness', () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: null,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    renderWithProviders(<TeamManagement />);

    expect(screen.getByText('לא נבחר עסק')).toBeInTheDocument();
  });

  it('shows loading state while fetching team', () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: activeBusinessStub,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    vi.mocked(businessesApi.fetchTeamMembers).mockReturnValue(new Promise(() => {}));

    renderWithProviders(<TeamManagement />);

    expect(screen.getByText('טוען צוות...')).toBeInTheDocument();
  });

  it('renders team table with member name and email', async () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: activeBusinessStub,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    vi.mocked(businessesApi.fetchTeamMembers).mockResolvedValue(teamListResponse);

    renderWithProviders(<TeamManagement />);

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('"הסר" button is not shown for owner', async () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: activeBusinessStub,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    vi.mocked(businessesApi.fetchTeamMembers).mockResolvedValue(teamListResponse);

    renderWithProviders(<TeamManagement />);

    await screen.findByText('Alice');

    expect(screen.queryByRole('button', { name: 'הסר' })).not.toBeInTheDocument();
  });

  it('clicking "הסר" on non-owner opens delete confirmation modal', async () => {
    const user = userEvent.setup();

    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: activeBusinessStub,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    vi.mocked(businessesApi.fetchTeamMembers).mockResolvedValue(teamListWithNonOwner);

    renderWithProviders(<TeamManagement />);

    await screen.findByText('Bob');

    await user.click(screen.getByRole('button', { name: 'הסר' }));

    await waitFor(() => {
      expect(screen.getByText('הסרת משתמש')).toBeInTheDocument();
    });
  });

  it('clicking "הזמן משתמש" opens invite modal', async () => {
    const user = userEvent.setup();

    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: activeBusinessStub,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    vi.mocked(businessesApi.fetchTeamMembers).mockResolvedValue(teamListResponse);

    renderWithProviders(<TeamManagement />);

    await screen.findByText('Alice');

    await user.click(screen.getByRole('button', { name: 'הזמן משתמש' }));

    await waitFor(() => {
      expect(screen.getByText('הזמן משתמש')).toBeInTheDocument();
    });
  });

  it('submitting invite form with invalid email shows validation error', async () => {
    const user = userEvent.setup();

    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: activeBusinessStub,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    vi.mocked(businessesApi.fetchTeamMembers).mockResolvedValue(teamListResponse);

    renderWithProviders(<TeamManagement />);

    await screen.findByText('Alice');

    await user.click(screen.getByRole('button', { name: 'הזמן משתמש' }));

    await screen.findByRole('button', { name: 'שלח הזמנה' });

    const emailInput = screen.getByPlaceholderText('user@example.com');
    await user.type(emailInput, 'not-valid-email');

    const inviteForm = screen.getByRole('button', { name: 'שלח הזמנה' }).closest('form')!;
    fireEvent.submit(inviteForm);

    await waitFor(() => {
      expect(screen.getByText('כתובת אימייל לא תקינה')).toBeInTheDocument();
    });
  });

  it('submitting invite form with valid email calls createInvitation', async () => {
    const user = userEvent.setup();

    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: activeBusinessStub,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    vi.mocked(businessesApi.fetchTeamMembers).mockResolvedValue(teamListResponse);
    vi.mocked(invitationsApi.createInvitation).mockResolvedValue(undefined);

    renderWithProviders(<TeamManagement />);

    await screen.findByText('Alice');

    await user.click(screen.getByRole('button', { name: 'הזמן משתמש' }));

    await waitFor(() => screen.getByText('שלח הזמנה'));

    const emailInput = screen.getByPlaceholderText('user@example.com');
    await user.type(emailInput, 'newuser@example.com');

    await user.click(screen.getByRole('button', { name: 'שלח הזמנה' }));

    await waitFor(() => expect(invitationsApi.createInvitation).toHaveBeenCalled());

    const callArgs = vi.mocked(invitationsApi.createInvitation).mock.calls[0];
    expect(callArgs?.[0]).toBe('biz-1');
    expect(callArgs?.[1]?.email).toBe('newuser@example.com');
  });
});
