import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { InvitationAccept } from '../../pages/InvitationAccept';
import { renderWithProviders } from '../utils/renderWithProviders';

vi.mock('../../api/invitations', () => ({
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
}));

import * as invitationsApi from '../../api/invitations';

describe('InvitationAccept page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows "הזמנה לא תקינה" when no token in URL', () => {
    renderWithProviders(<InvitationAccept />);

    expect(screen.getByText('הזמנה לא תקינה')).toBeInTheDocument();
  });

  it('shows accept and decline buttons when token is present', () => {
    renderWithProviders(<InvitationAccept />, {
      router: { initialEntries: ['/?token=abc123'] },
    });

    expect(screen.getByText('הזמנה לצוות')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'קבל' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'דחה' })).toBeInTheDocument();
  });

  it('clicking accept calls acceptInvitation with the token', async () => {
    vi.mocked(invitationsApi.acceptInvitation).mockResolvedValue(undefined);

    renderWithProviders(<InvitationAccept />, {
      router: { initialEntries: ['/?token=abc123'] },
    });

    fireEvent.click(screen.getByRole('button', { name: 'קבל' }));

    await waitFor(() => expect(invitationsApi.acceptInvitation).toHaveBeenCalled());
    expect(vi.mocked(invitationsApi.acceptInvitation).mock.calls[0]?.[0]).toBe('abc123');
  });

  it('clicking decline calls declineInvitation with the token', async () => {
    vi.mocked(invitationsApi.declineInvitation).mockResolvedValue(undefined);

    renderWithProviders(<InvitationAccept />, {
      router: { initialEntries: ['/?token=abc123'] },
    });

    fireEvent.click(screen.getByRole('button', { name: 'דחה' }));

    await waitFor(() => expect(invitationsApi.declineInvitation).toHaveBeenCalled());
    expect(vi.mocked(invitationsApi.declineInvitation).mock.calls[0]?.[0]).toBe('abc123');
  });
});
