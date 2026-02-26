import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BusinessProfileGateModal } from '../../components/BusinessProfileGateModal';
import { renderWithProviders } from '../utils/renderWithProviders';
import { makeTestBusiness } from '../utils/businessStubs';
import type { Business } from '@bon/types/businesses';

vi.mock('../../api/businesses', () => ({
  updateBusiness: vi.fn(),
}));
vi.mock('../../lib/notifications', () => ({
  extractErrorMessage: vi.fn((_error: unknown, fallback: string) => fallback),
}));
vi.mock('../../api/address', () => ({
  fetchAllCities: vi.fn().mockResolvedValue([]),
  fetchAllStreetsForCity: vi.fn().mockResolvedValue([]),
  filterOptions: vi.fn().mockReturnValue([]),
}));

import * as businessApi from '../../api/businesses';
import * as addressApi from '../../api/address';

// ── helpers ──

const defaultProps = {
  opened: true,
  onClose: vi.fn(),
  onSaved: vi.fn(),
};

function renderModal(businessOverrides: Partial<Business> = {}) {
  const business = makeTestBusiness(businessOverrides);
  return renderWithProviders(
    <BusinessProfileGateModal
      {...defaultProps}
      business={business}
      businessType={business.businessType}
    />
  );
}

describe('BusinessProfileGateModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Restore address mocks cleared by resetAllMocks
    vi.mocked(addressApi.fetchAllCities).mockResolvedValue([]);
    vi.mocked(addressApi.fetchAllStreetsForCity).mockResolvedValue([]);
    vi.mocked(addressApi.filterOptions).mockReturnValue([]);
  });

  it('shows address fields when address is missing', () => {
    renderModal({ streetAddress: null, city: null });

    expect(screen.getByLabelText(/עיר \/ ישוב/)).toBeInTheDocument();
    expect(screen.getByLabelText(/רחוב/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/שם העסק/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/מע"מ/)).not.toBeInTheDocument();
  });

  it('shows vatNumber field for non-exempt businesses missing it', () => {
    renderModal({ vatNumber: null });

    expect(screen.getByLabelText(/מע"מ/)).toBeInTheDocument();
  });

  it('does not show vatNumber for exempt_dealer', () => {
    renderModal({
      businessType: 'exempt_dealer',
      vatNumber: null,
      streetAddress: null,
    });

    expect(screen.queryByLabelText(/מע"מ/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/עיר \/ ישוב/)).toBeInTheDocument();
  });

  it('calls updateBusiness and onSaved on successful submit', async () => {
    vi.mocked(businessApi.updateBusiness).mockResolvedValue({
      business: makeTestBusiness(),
      role: 'owner',
    });
    const user = userEvent.setup();
    renderModal({ name: '' });

    await user.type(screen.getByLabelText(/שם העסק/), 'עסק חדש');
    await user.click(screen.getByRole('button', { name: 'שמור והמשך' }));

    await waitFor(() => {
      expect(businessApi.updateBusiness).toHaveBeenCalledWith('biz-1', { name: 'עסק חדש' });
      expect(defaultProps.onSaved).toHaveBeenCalled();
    });
  });

  it('shows inline error when PATCH fails', async () => {
    vi.mocked(businessApi.updateBusiness).mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    renderModal({ name: '' });

    await user.type(screen.getByLabelText(/שם העסק/), 'עסק חדש');
    await user.click(screen.getByRole('button', { name: 'שמור והמשך' }));

    expect(await screen.findByText('לא הצלחנו לשמור את פרטי העסק')).toBeInTheDocument();
    expect(defaultProps.onSaved).not.toHaveBeenCalled();
  });
});
