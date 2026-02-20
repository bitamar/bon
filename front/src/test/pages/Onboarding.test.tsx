import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Onboarding } from '../../pages/Onboarding';
import { renderWithProviders } from '../utils/renderWithProviders';

vi.mock('../../api/businesses', () => ({
  createBusiness: vi.fn(),
}));

import * as businessesApi from '../../api/businesses';

const mockCreatedBusiness = {
  id: 'biz-new',
  name: 'New Co',
  businessType: 'licensed_dealer' as const,
  registrationNumber: '123456789',
  vatNumber: null,
  streetAddress: null,
  city: null,
  postalCode: null,
  phone: null,
  email: null,
  invoiceNumberPrefix: null,
  startingInvoiceNumber: 1,
  defaultVatRate: 1700,
  logoUrl: null,
  isActive: true,
  createdByUserId: 'u-1',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

// ── helpers ──────────────────────────────────────────────────────────────────

type User = ReturnType<typeof userEvent.setup>;

async function selectBusinessType(user: User, type: 'עוסק מורשה' | 'עוסק פטור' | 'חברה בע״מ') {
  await user.click(screen.getByText(type));
}

async function fillAndSubmit(
  user: User,
  opts: { name: string; registrationNumber: string; type: 'עוסק מורשה' | 'עוסק פטור' | 'חברה בע״מ' }
) {
  await selectBusinessType(user, opts.type);
  const nameInput = screen.getByRole('textbox', { name: /שם/ });
  await user.clear(nameInput);
  await user.type(nameInput, opts.name);
  const regInput = screen.getByRole('textbox', { name: /מספר/ });
  await user.clear(regInput);
  await user.type(regInput, opts.registrationNumber);
  await user.click(screen.getByRole('button', { name: 'צור עסק' }));
  await waitFor(() => expect(businessesApi.createBusiness).toHaveBeenCalled());
  return vi.mocked(businessesApi.createBusiness).mock.calls[0]?.[0];
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('Onboarding page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the form with "bon" title visible', () => {
    renderWithProviders(<Onboarding />);
    expect(screen.getByRole('heading', { name: 'bon' })).toBeInTheDocument();
  });

  it('renders with no pre-selected business type', () => {
    renderWithProviders(<Onboarding />);

    const licensedCard = screen.getByText('עוסק מורשה').closest('[role="radio"]');
    const exemptCard = screen.getByText('עוסק פטור').closest('[role="radio"]');
    const companyCard = screen.getByText('חברה בע״מ').closest('[role="radio"]');

    expect(licensedCard).toHaveAttribute('aria-checked', 'false');
    expect(exemptCard).toHaveAttribute('aria-checked', 'false');
    expect(companyCard).toHaveAttribute('aria-checked', 'false');
  });

  it('shows correct labels for עוסק פטור', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Onboarding />);

    await selectBusinessType(user, 'עוסק פטור');

    expect(screen.getByRole('textbox', { name: /שם מלא/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /מספר תעודת זהות/ })).toBeInTheDocument();
  });

  it('shows correct labels for עוסק מורשה', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Onboarding />);

    await selectBusinessType(user, 'עוסק מורשה');

    expect(screen.getByRole('textbox', { name: /שם העסק/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /מספר עוסק מורשה/ })).toBeInTheDocument();
  });

  it('changing type clears registration number but preserves name', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Onboarding />);

    await selectBusinessType(user, 'עוסק מורשה');
    await user.type(screen.getByRole('textbox', { name: /שם העסק/ }), 'My Business');
    await user.type(screen.getByRole('textbox', { name: /מספר עוסק מורשה/ }), '123456789');

    await selectBusinessType(user, 'עוסק פטור');

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /שם מלא/ })).toHaveValue('My Business');
      expect(screen.getByRole('textbox', { name: /מספר תעודת זהות/ })).toHaveValue('');
    });
  });

  it('shows invalid ת.ז. error for עוסק פטור with wrong checksum', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Onboarding />);

    await selectBusinessType(user, 'עוסק פטור');
    await user.type(screen.getByRole('textbox', { name: /שם מלא/ }), 'ישראל ישראלי');
    await user.type(screen.getByRole('textbox', { name: /מספר תעודת זהות/ }), '123456789');
    await user.click(screen.getByRole('button', { name: 'צור עסק' }));

    await waitFor(() => {
      expect(screen.getByText('מספר ת.ז. לא תקין')).toBeInTheDocument();
    });
  });

  it('successful submission calls createBusiness with correct payload for licensed_dealer', async () => {
    const user = userEvent.setup();
    vi.mocked(businessesApi.createBusiness).mockResolvedValue({
      business: mockCreatedBusiness,
      role: 'owner',
    });

    renderWithProviders(<Onboarding />);

    const payload = await fillAndSubmit(user, {
      type: 'עוסק מורשה',
      name: 'New Co',
      registrationNumber: '123456789',
    });

    expect(payload?.name).toBe('New Co');
    expect(payload?.registrationNumber).toBe('123456789');
    expect(payload?.businessType).toBe('licensed_dealer');
    expect(payload?.defaultVatRate).toBeUndefined();
  });

  it('for עוסק פטור, payload has defaultVatRate 0', async () => {
    const user = userEvent.setup();
    vi.mocked(businessesApi.createBusiness).mockResolvedValue({
      business: {
        ...mockCreatedBusiness,
        businessType: 'exempt_dealer',
        vatNumber: null,
        defaultVatRate: 0,
      },
      role: 'owner',
    });

    renderWithProviders(<Onboarding />);

    const payload = await fillAndSubmit(user, {
      type: 'עוסק פטור',
      name: 'ישראל ישראלי',
      // 000000018: valid Israeli ID checksum
      registrationNumber: '000000018',
    });

    expect(payload?.businessType).toBe('exempt_dealer');
    expect(payload?.defaultVatRate).toBe(0);
  });

  it('shows inline error on registrationNumber field when duplicate_registration_number returned', async () => {
    const user = userEvent.setup();
    const { HttpError: MockHttpError } = await import('../../lib/http');
    const error = new MockHttpError(409, 'Conflict', { code: 'duplicate_registration_number' });
    vi.mocked(businessesApi.createBusiness).mockRejectedValue(error);

    renderWithProviders(<Onboarding />);

    await fillAndSubmit(user, {
      type: 'עוסק מורשה',
      name: 'New Co',
      registrationNumber: '123456789',
    }).catch(() => undefined);

    await waitFor(() => {
      expect(screen.getByText('מספר רישום זה כבר קיים במערכת')).toBeInTheDocument();
    });
  });
});
