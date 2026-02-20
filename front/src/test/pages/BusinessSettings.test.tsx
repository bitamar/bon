import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { BusinessSettings } from '../../pages/BusinessSettings';
import { renderWithProviders } from '../utils/renderWithProviders';

vi.mock('../../contexts/BusinessContext', () => ({ useBusiness: vi.fn() }));
vi.mock('../../api/businesses', () => ({
  fetchBusiness: vi.fn(),
  updateBusiness: vi.fn(),
}));
vi.mock('../../api/address', () => ({
  fetchAllCities: vi.fn().mockResolvedValue([]),
  fetchAllStreetsForCity: vi.fn().mockResolvedValue([]),
  filterOptions: vi.fn((options: { name: string }[], query: string) => {
    const q = query.trim();
    if (!q) return options;
    return options.filter((o) => o.name.includes(q));
  }),
}));

import { useBusiness } from '../../contexts/BusinessContext';
import * as businessesApi from '../../api/businesses';

const mockBusiness = {
  id: 'biz-1',
  name: 'Test Co',
  businessType: 'licensed_dealer' as const,
  registrationNumber: '123456789',
  vatNumber: null,
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

const activeBusinessStub = {
  id: 'biz-1',
  name: 'Test Co',
  businessType: 'licensed_dealer',
  role: 'owner',
};

describe('BusinessSettings page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows "לא נבחר עסק" when activeBusiness is null', () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: null,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    renderWithProviders(<BusinessSettings />);

    expect(screen.getByText('לא נבחר עסק')).toBeInTheDocument();
  });

  it('shows loading state while fetching', async () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: activeBusinessStub,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    vi.mocked(businessesApi.fetchBusiness).mockReturnValue(new Promise(() => {}));

    renderWithProviders(<BusinessSettings />);

    expect(await screen.findByText('טוען נתוני עסק...')).toBeInTheDocument();
  });

  it('shows form with business name when loaded', async () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: activeBusinessStub,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    vi.mocked(businessesApi.fetchBusiness).mockResolvedValue({
      business: mockBusiness,
      role: 'owner' as const,
    });

    renderWithProviders(<BusinessSettings />);

    await waitFor(() => expect(businessesApi.fetchBusiness).toHaveBeenCalled());

    const nameInput = await screen.findByRole('textbox', { name: /שם העסק/ });
    expect(nameInput).toHaveValue('Test Co');
  });

  it('shows error state when fetchBusiness rejects', async () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: activeBusinessStub,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    vi.mocked(businessesApi.fetchBusiness).mockRejectedValue(new Error('Network error'));

    renderWithProviders(<BusinessSettings />);

    expect(await screen.findByText('שגיאה בטעינת נתוני העסק')).toBeInTheDocument();
  });

  it('submitting form calls updateBusiness without registrationNumber', async () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: activeBusinessStub,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    vi.mocked(businessesApi.fetchBusiness).mockResolvedValue({
      business: mockBusiness,
      role: 'owner' as const,
    });
    vi.mocked(businessesApi.updateBusiness).mockResolvedValue({
      business: mockBusiness,
      role: 'owner' as const,
    });

    renderWithProviders(<BusinessSettings />);

    await waitFor(() => expect(businessesApi.fetchBusiness).toHaveBeenCalled());
    await screen.findByRole('textbox', { name: /שם העסק/ });

    const form = screen.getByRole('button', { name: 'שמור שינויים' }).closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => expect(businessesApi.updateBusiness).toHaveBeenCalled());

    const callArgs = vi.mocked(businessesApi.updateBusiness).mock.calls[0];
    expect(callArgs?.[0]).toBe('biz-1');
    expect(callArgs?.[1]).not.toHaveProperty('registrationNumber');
  });

  it('shows phone validation error when phone is invalid', async () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: activeBusinessStub,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    vi.mocked(businessesApi.fetchBusiness).mockResolvedValue({
      business: mockBusiness,
      role: 'owner' as const,
    });

    renderWithProviders(<BusinessSettings />);

    await waitFor(() => expect(businessesApi.fetchBusiness).toHaveBeenCalled());

    const phoneInput = await screen.findByRole('textbox', { name: /טלפון/ });
    fireEvent.change(phoneInput, { target: { value: '12345' } });

    const form = screen.getByRole('button', { name: 'שמור שינויים' }).closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('מספר טלפון לא תקין')).toBeInTheDocument();
    });
  });

  it('shows email validation error when email is invalid', async () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: activeBusinessStub,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    vi.mocked(businessesApi.fetchBusiness).mockResolvedValue({
      business: mockBusiness,
      role: 'owner' as const,
    });

    renderWithProviders(<BusinessSettings />);

    await waitFor(() => expect(businessesApi.fetchBusiness).toHaveBeenCalled());

    const emailInput = await screen.findByRole('textbox', { name: /אימייל/ });
    fireEvent.change(emailInput, { target: { value: 'not-an-email' } });

    const form = screen.getByRole('button', { name: 'שמור שינויים' }).closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('כתובת אימייל לא תקינה')).toBeInTheDocument();
    });
  });

  it('populates form from fetched business with null optional fields', async () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: activeBusinessStub,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    vi.mocked(businessesApi.fetchBusiness).mockResolvedValue({
      business: {
        ...mockBusiness,
        postalCode: null,
        phone: null,
        email: null,
        invoiceNumberPrefix: null,
      },
      role: 'owner' as const,
    });

    renderWithProviders(<BusinessSettings />);

    await waitFor(() => expect(businessesApi.fetchBusiness).toHaveBeenCalled());

    const nameInput = await screen.findByRole('textbox', { name: /שם העסק/ });
    expect(nameInput).toHaveValue('Test Co');

    const phoneInput = screen.getByRole('textbox', { name: /טלפון/ });
    expect(phoneInput).toHaveValue('');
  });

  it('shows business type label', async () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: activeBusinessStub,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    vi.mocked(businessesApi.fetchBusiness).mockResolvedValue({
      business: mockBusiness,
      role: 'owner' as const,
    });

    renderWithProviders(<BusinessSettings />);

    expect(await screen.findByText('עוסק מורשה')).toBeInTheDocument();
  });
});
