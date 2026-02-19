import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
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
  vatNumber: '123456789',
  streetAddress: '1 Main',
  city: 'TLV',
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

describe('Onboarding page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the form with "BON" title visible', () => {
    renderWithProviders(<Onboarding />);

    expect(screen.getByRole('heading', { name: 'BON' })).toBeInTheDocument();
  });

  it('shows validation errors when submitting empty required fields', async () => {
    renderWithProviders(<Onboarding />);

    const form = screen
      .getByRole('button', { name: /צור עסק והתחל להנפיק חשבוניות/ })
      .closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('שם העסק נדרש')).toBeInTheDocument();
    });
    expect(screen.getByText('מספר רישום נדרש')).toBeInTheDocument();
    expect(screen.getByText('כתובת רחוב נדרשת')).toBeInTheDocument();
    expect(screen.getByText('עיר נדרשת')).toBeInTheDocument();
  });

  it('vatNumber is disabled for exempt_dealer business type', async () => {
    const user = userEvent.setup();

    renderWithProviders(<Onboarding />);

    await user.click(screen.getByText('עוסק פטור'));

    await waitFor(() => {
      const vatInput = screen.getByRole('textbox', { name: /מספר מע"מ/ });
      expect(vatInput).toBeDisabled();
    });
  });

  it('registrationNumber blur auto-fills vatNumber for licensed_dealer when 9 digits', async () => {
    const user = userEvent.setup();

    renderWithProviders(<Onboarding />);

    const regInput = screen.getByRole('textbox', { name: /מספר רישום/ });
    await user.click(regInput);
    await user.type(regInput, '123456789');
    await user.tab();

    await waitFor(() => {
      const vatInput = screen.getByRole('textbox', { name: /מספר עוסק מורשה/ });
      expect(vatInput).toHaveValue('123456789');
    });
  });

  it('successful submission calls createBusiness with correct payload', async () => {
    const user = userEvent.setup();

    vi.mocked(businessesApi.createBusiness).mockResolvedValue({
      business: mockCreatedBusiness,
      role: 'owner',
    });

    renderWithProviders(<Onboarding />);

    await user.type(screen.getByRole('textbox', { name: /שם העסק/ }), 'New Co');

    const regInput = screen.getByRole('textbox', { name: /מספר רישום/ });
    await user.type(regInput, '123456789');
    await user.tab();

    await waitFor(() => {
      const vatInput = screen.getByRole('textbox', { name: /מספר עוסק מורשה/ });
      expect(vatInput).toHaveValue('123456789');
    });

    await user.type(screen.getByRole('textbox', { name: /רחוב ומספר/ }), '1 Main');
    await user.type(screen.getByRole('textbox', { name: /^עיר/ }), 'TLV');

    await user.click(screen.getByRole('button', { name: /צור עסק והתחל להנפיק חשבוניות/ }));

    await waitFor(() => expect(businessesApi.createBusiness).toHaveBeenCalled());

    const payload = vi.mocked(businessesApi.createBusiness).mock.calls[0]?.[0];
    expect(payload?.name).toBe('New Co');
    expect(payload?.registrationNumber).toBe('123456789');
    expect(payload?.streetAddress).toBe('1 Main');
    expect(payload?.city).toBe('TLV');
  });
});
