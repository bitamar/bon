import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BusinessProfileGateModal } from '../../components/BusinessProfileGateModal';
import { renderWithProviders } from '../utils/renderWithProviders';
import type { Business } from '@bon/types/businesses';

vi.mock('../../api/businesses', () => ({
  updateBusiness: vi.fn(),
}));
vi.mock('../../lib/notifications', () => ({
  extractErrorMessage: vi.fn((_error: unknown, fallback: string) => fallback),
}));

import * as businessApi from '../../api/businesses';

// ── helpers ──

function makeTestBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: 'biz-1',
    name: 'Test Co',
    businessType: 'licensed_dealer',
    registrationNumber: '123456782',
    vatNumber: '123456782',
    streetAddress: '123 Main St',
    city: 'Tel Aviv',
    postalCode: '1234567',
    phone: null,
    email: null,
    invoiceNumberPrefix: null,
    startingInvoiceNumber: 1,
    defaultVatRate: 1700,
    logoUrl: null,
    isActive: true,
    createdByUserId: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

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
  });

  it('shows only missing fields', () => {
    renderModal({ streetAddress: null, city: null });

    expect(screen.getByLabelText(/כתובת/)).toBeInTheDocument();
    expect(screen.getByLabelText(/עיר/)).toBeInTheDocument();
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
    expect(screen.getByLabelText(/כתובת/)).toBeInTheDocument();
  });

  it('calls updateBusiness and onSaved on successful submit', async () => {
    vi.mocked(businessApi.updateBusiness).mockResolvedValue({
      business: makeTestBusiness(),
      role: 'owner',
    });
    const user = userEvent.setup();
    renderModal({ city: null });

    await user.type(screen.getByLabelText(/עיר/), 'ירושלים');
    await user.click(screen.getByRole('button', { name: 'שמור והמשך' }));

    await waitFor(() => {
      expect(businessApi.updateBusiness).toHaveBeenCalledWith('biz-1', { city: 'ירושלים' });
    });
    expect(defaultProps.onSaved).toHaveBeenCalled();
  });

  it('shows inline error when PATCH fails', async () => {
    vi.mocked(businessApi.updateBusiness).mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    renderModal({ city: null });

    await user.type(screen.getByLabelText(/עיר/), 'ירושלים');
    await user.click(screen.getByRole('button', { name: 'שמור והמשך' }));

    expect(await screen.findByText('לא הצלחנו לשמור את פרטי העסק')).toBeInTheDocument();
    expect(defaultProps.onSaved).not.toHaveBeenCalled();
  });
});
