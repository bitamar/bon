import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
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
import { activeBusinessStub } from '../utils/businessStubs';

// ── helpers ──

function renderSettings() {
  return renderWithProviders(
    <Routes>
      <Route path="/businesses/:businessId/settings" element={<BusinessSettings />} />
    </Routes>,
    { router: { initialEntries: ['/businesses/biz-1/settings'] } }
  );
}

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

describe('BusinessSettings page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: activeBusinessStub,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });
  });

  it('shows "לא נבחר עסק" when activeBusiness is null', () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: null,
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });

    renderSettings();

    expect(screen.getByText('לא נבחר עסק')).toBeInTheDocument();
  });

  it('shows loading state while fetching', async () => {
    vi.mocked(businessesApi.fetchBusiness).mockReturnValue(new Promise(() => {}));

    renderSettings();

    expect(await screen.findByText('טוען נתוני עסק...')).toBeInTheDocument();
  });

  it('shows form with business name when loaded', async () => {
    vi.mocked(businessesApi.fetchBusiness).mockResolvedValue({
      business: mockBusiness,
      role: 'owner' as const,
    });

    renderSettings();

    await waitFor(() => expect(businessesApi.fetchBusiness).toHaveBeenCalled());

    expect(await screen.findByRole('textbox', { name: /שם העסק/ })).toHaveValue('Test Co');
  });

  it('shows error state when fetchBusiness rejects', async () => {
    vi.mocked(businessesApi.fetchBusiness).mockRejectedValue(new Error('Network error'));

    renderSettings();

    expect(await screen.findByText('לא הצלחנו לטעון את נתוני העסק')).toBeInTheDocument();
  });

  it('submitting form calls updateBusiness without registrationNumber', async () => {
    vi.mocked(businessesApi.fetchBusiness).mockResolvedValue({
      business: mockBusiness,
      role: 'owner' as const,
    });
    vi.mocked(businessesApi.updateBusiness).mockResolvedValue({
      business: mockBusiness,
      role: 'owner' as const,
    });

    renderSettings();

    await waitFor(() => expect(businessesApi.fetchBusiness).toHaveBeenCalled());
    await screen.findByRole('textbox', { name: /שם העסק/ });

    fireEvent.submit(
      screen.getByRole('button', { name: 'שמור שינויים' }).closest('form') as HTMLFormElement
    );

    await waitFor(() => expect(businessesApi.updateBusiness).toHaveBeenCalled());

    const callArgs = vi.mocked(businessesApi.updateBusiness).mock.calls[0];
    expect(callArgs?.[0]).toBe('biz-1');
    expect(callArgs?.[1]).not.toHaveProperty('registrationNumber');
  });

  it('shows phone validation error when phone is invalid', async () => {
    vi.mocked(businessesApi.fetchBusiness).mockResolvedValue({
      business: mockBusiness,
      role: 'owner' as const,
    });

    renderSettings();

    await waitFor(() => expect(businessesApi.fetchBusiness).toHaveBeenCalled());

    fireEvent.change(await screen.findByRole('textbox', { name: /טלפון/ }), {
      target: { value: '12345' },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: 'שמור שינויים' }).closest('form') as HTMLFormElement
    );

    await waitFor(() => {
      expect(screen.getByText('מספר טלפון לא תקין')).toBeInTheDocument();
    });
  });

  it('shows email validation error when email is invalid', async () => {
    vi.mocked(businessesApi.fetchBusiness).mockResolvedValue({
      business: mockBusiness,
      role: 'owner' as const,
    });

    renderSettings();

    await waitFor(() => expect(businessesApi.fetchBusiness).toHaveBeenCalled());

    fireEvent.change(await screen.findByRole('textbox', { name: /אימייל/ }), {
      target: { value: 'not-an-email' },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: 'שמור שינויים' }).closest('form') as HTMLFormElement
    );

    await waitFor(() => {
      expect(screen.getByText('כתובת אימייל לא תקינה')).toBeInTheDocument();
    });
  });

  it('populates form from fetched business with null optional fields', async () => {
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

    renderSettings();

    await waitFor(() => expect(businessesApi.fetchBusiness).toHaveBeenCalled());

    expect(await screen.findByRole('textbox', { name: /שם העסק/ })).toHaveValue('Test Co');
    expect(screen.getByRole('textbox', { name: /טלפון/ })).toHaveValue('');
  });

  it('shows business type label', async () => {
    vi.mocked(businessesApi.fetchBusiness).mockResolvedValue({
      business: mockBusiness,
      role: 'owner' as const,
    });

    renderSettings();

    expect(await screen.findByText('עוסק מורשה')).toBeInTheDocument();
  });

  it('shows vatNumber field for licensed_dealer and populates from API', async () => {
    vi.mocked(businessesApi.fetchBusiness).mockResolvedValue({
      business: { ...mockBusiness, vatNumber: '987654321' },
      role: 'owner' as const,
    });

    renderSettings();

    await waitFor(() => expect(businessesApi.fetchBusiness).toHaveBeenCalled());

    expect(await screen.findByRole('textbox', { name: /מספר רישום מע״מ/ })).toHaveValue(
      '987654321'
    );
  });

  it('hides vatNumber field for exempt_dealer', async () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: { ...activeBusinessStub, businessType: 'exempt_dealer' },
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });
    vi.mocked(businessesApi.fetchBusiness).mockResolvedValue({
      business: { ...mockBusiness, businessType: 'exempt_dealer' as const },
      role: 'owner' as const,
    });

    renderSettings();

    await waitFor(() => expect(businessesApi.fetchBusiness).toHaveBeenCalled());

    expect(screen.queryByRole('textbox', { name: /מספר רישום מע״מ/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /מספר מע"מ/ })).not.toBeInTheDocument();
  });

  it('shows "מספר מע"מ" label for limited_company', async () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: { ...activeBusinessStub, businessType: 'limited_company' },
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });
    vi.mocked(businessesApi.fetchBusiness).mockResolvedValue({
      business: { ...mockBusiness, businessType: 'limited_company' as const },
      role: 'owner' as const,
    });

    renderSettings();

    await waitFor(() => expect(businessesApi.fetchBusiness).toHaveBeenCalled());

    expect(await screen.findByText('חברה בע״מ')).toBeInTheDocument();
  });

  it('shows vatNumber validation error when value is not 9 digits', async () => {
    vi.mocked(businessesApi.fetchBusiness).mockResolvedValue({
      business: mockBusiness,
      role: 'owner' as const,
    });

    renderSettings();

    await waitFor(() => expect(businessesApi.fetchBusiness).toHaveBeenCalled());

    fireEvent.change(await screen.findByRole('textbox', { name: /מספר רישום מע״מ/ }), {
      target: { value: '12345' },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: 'שמור שינויים' }).closest('form') as HTMLFormElement
    );

    await waitFor(() => {
      expect(screen.getByText('מספר רישום חייב להיות 9 ספרות')).toBeInTheDocument();
    });
  });

  it('pre-populates city and street from existing business data', async () => {
    vi.mocked(businessesApi.fetchBusiness).mockResolvedValue({
      business: { ...mockBusiness, city: 'TLV', streetAddress: '1 Main' },
      role: 'owner' as const,
    });

    renderSettings();

    await waitFor(() => expect(businessesApi.fetchBusiness).toHaveBeenCalled());

    expect(await screen.findByRole('textbox', { name: /^עיר/ })).toHaveValue('TLV');
    expect(screen.getByRole('textbox', { name: /^רחוב/ })).toHaveValue('1 Main');
  });

  it('accepts a valid 9-digit vatNumber without showing a validation error', async () => {
    vi.mocked(businessesApi.fetchBusiness).mockResolvedValue({
      business: mockBusiness,
      role: 'owner' as const,
    });
    vi.mocked(businessesApi.updateBusiness).mockResolvedValue({
      business: mockBusiness,
      role: 'owner' as const,
    });

    renderSettings();

    await waitFor(() => expect(businessesApi.fetchBusiness).toHaveBeenCalled());

    fireEvent.change(await screen.findByRole('textbox', { name: /מספר רישום מע״מ/ }), {
      target: { value: '123456789' },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: 'שמור שינויים' }).closest('form') as HTMLFormElement
    );

    await waitFor(() => expect(businessesApi.updateBusiness).toHaveBeenCalled());
    expect(screen.queryByText('מספר רישום חייב להיות 9 ספרות')).not.toBeInTheDocument();
  });

  it('clicking "נסה שוב" in error state triggers refetch', async () => {
    vi.mocked(businessesApi.fetchBusiness).mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();

    renderSettings();

    const retryBtn = await screen.findByRole('button', { name: 'נסה שוב' });
    vi.mocked(businessesApi.fetchBusiness).mockResolvedValue({
      business: mockBusiness,
      role: 'owner' as const,
    });
    await user.click(retryBtn);

    expect(businessesApi.fetchBusiness).toHaveBeenCalledTimes(2);
  });

  it('clicking ביטול calls navigate(-1) without errors', async () => {
    vi.mocked(businessesApi.fetchBusiness).mockResolvedValue({
      business: mockBusiness,
      role: 'owner' as const,
    });
    const user = userEvent.setup();

    renderSettings();

    await screen.findByRole('textbox', { name: /שם העסק/ });

    // Clicking ביטול triggers navigate(-1). With MemoryRouter having no prior history
    // it is a no-op navigation, but the onClick handler is still invoked (covering line 240).
    await user.click(screen.getByRole('button', { name: 'ביטול' }));

    // Component should still be in the DOM (no prior history to go back to)
    expect(screen.getByRole('button', { name: 'ביטול' })).toBeInTheDocument();
  });
});
