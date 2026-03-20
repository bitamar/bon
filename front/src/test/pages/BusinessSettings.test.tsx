import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BusinessSettingsSection } from '../../pages/BusinessSettings';
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
import * as addressApi from '../../api/address';
import { activeBusinessStub } from '../utils/businessStubs';

// ── helpers ──

function renderSection() {
  return renderWithProviders(<BusinessSettingsSection />);
}

function mockLoadedBusiness(overrides: Record<string, unknown> = {}) {
  vi.mocked(businessesApi.fetchBusiness).mockResolvedValue({
    business: { ...mockBusiness, ...overrides },
    role: 'owner' as const,
  });
}

async function renderLoadedSection(overrides: Record<string, unknown> = {}) {
  mockLoadedBusiness(overrides);
  renderSection();
  await waitFor(() => expect(businessesApi.fetchBusiness).toHaveBeenCalled());
}

function submitSettingsForm() {
  fireEvent.submit(
    screen.getByRole('button', { name: 'שמור שינויים' }).closest('form') as HTMLFormElement
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

describe('BusinessSettingsSection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: activeBusinessStub,
      businesses: [],
      switchBusiness: vi.fn(),
      setActiveBusiness: vi.fn(),
      isLoading: false,
    });
    // fetchBusiness returns a never-resolving promise by default so tests that don't
    // care about business data don't get "Query data cannot be undefined" warnings.
    vi.mocked(businessesApi.fetchBusiness).mockReturnValue(new Promise(() => {}));
    // resetAllMocks clears the mockResolvedValue([]) set in the vi.mock() factory.
    vi.mocked(addressApi.fetchAllCities).mockResolvedValue([]);
    vi.mocked(addressApi.fetchAllStreetsForCity).mockResolvedValue([]);
  });

  it('renders nothing when activeBusiness is null', () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: null,
      businesses: [],
      switchBusiness: vi.fn(),
      setActiveBusiness: vi.fn(),
      isLoading: false,
    });

    const { container } = renderSection();

    expect(container.querySelector('form')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="form-skeleton"]')).not.toBeInTheDocument();
  });

  it('shows loading skeleton while fetching', async () => {
    vi.mocked(businessesApi.fetchBusiness).mockReturnValue(new Promise(() => {}));

    renderSection();

    expect(screen.getByTestId('form-skeleton')).toBeInTheDocument();
  });

  it('shows form with business name when loaded', async () => {
    await renderLoadedSection();

    expect(await screen.findByRole('textbox', { name: /שם העסק/ })).toHaveValue('Test Co');
  });

  it('shows error state when fetchBusiness rejects', async () => {
    vi.mocked(businessesApi.fetchBusiness).mockRejectedValue(new Error('Network error'));

    renderSection();

    expect(await screen.findByText('לא הצלחנו לטעון את נתוני העסק')).toBeInTheDocument();
  });

  it('submitting form calls updateBusiness without registrationNumber', async () => {
    vi.mocked(businessesApi.updateBusiness).mockResolvedValue({
      business: mockBusiness,
      role: 'owner' as const,
    });

    await renderLoadedSection();
    await screen.findByRole('textbox', { name: /שם העסק/ });

    submitSettingsForm();

    await waitFor(() => expect(businessesApi.updateBusiness).toHaveBeenCalled());

    const callArgs = vi.mocked(businessesApi.updateBusiness).mock.calls[0];
    expect(callArgs?.[0]).toBe('biz-1');
    expect(callArgs?.[1]).not.toHaveProperty('registrationNumber');
  });

  it('shows phone validation error when phone is invalid', async () => {
    await renderLoadedSection();

    fireEvent.change(await screen.findByRole('textbox', { name: /טלפון/ }), {
      target: { value: '12345' },
    });
    submitSettingsForm();

    await waitFor(() => {
      expect(screen.getByText('מספר טלפון לא תקין')).toBeInTheDocument();
    });
  });

  it('shows email validation error when email is invalid', async () => {
    await renderLoadedSection();

    fireEvent.change(await screen.findByRole('textbox', { name: /אימייל/ }), {
      target: { value: 'not-an-email' },
    });
    submitSettingsForm();

    await waitFor(() => {
      expect(screen.getByText('כתובת אימייל לא תקינה')).toBeInTheDocument();
    });
  });

  it('populates form from fetched business with null optional fields', async () => {
    await renderLoadedSection({
      postalCode: null,
      phone: null,
      email: null,
      invoiceNumberPrefix: null,
    });

    expect(await screen.findByRole('textbox', { name: /שם העסק/ })).toHaveValue('Test Co');
    expect(screen.getByRole('textbox', { name: /טלפון/ })).toHaveValue('');
  });

  it('shows business type label', async () => {
    await renderLoadedSection();

    expect(await screen.findByText('עוסק מורשה')).toBeInTheDocument();
  });

  it('shows vatNumber field for licensed_dealer and populates from API', async () => {
    await renderLoadedSection({ vatNumber: '987654321' });

    expect(await screen.findByRole('textbox', { name: /מספר רישום מע״מ/ })).toHaveValue(
      '987654321'
    );
  });

  it('hides vatNumber field for exempt_dealer', async () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: { ...activeBusinessStub, businessType: 'exempt_dealer' },
      businesses: [],
      switchBusiness: vi.fn(),
      setActiveBusiness: vi.fn(),
      isLoading: false,
    });
    await renderLoadedSection({ businessType: 'exempt_dealer' as const });

    expect(screen.queryByRole('textbox', { name: /מספר רישום מע״מ/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /מספר מע"מ/ })).not.toBeInTheDocument();
  });

  it('shows "מספר מע"מ" label for limited_company', async () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: { ...activeBusinessStub, businessType: 'limited_company' },
      businesses: [],
      switchBusiness: vi.fn(),
      setActiveBusiness: vi.fn(),
      isLoading: false,
    });
    await renderLoadedSection({ businessType: 'limited_company' as const });

    expect(await screen.findByText('חברה בע״מ')).toBeInTheDocument();
  });

  it('shows vatNumber validation error when value is not 9 digits', async () => {
    await renderLoadedSection();

    fireEvent.change(await screen.findByRole('textbox', { name: /מספר רישום מע״מ/ }), {
      target: { value: '12345' },
    });
    submitSettingsForm();

    await waitFor(() => {
      expect(screen.getByText('מספר רישום חייב להיות 9 ספרות')).toBeInTheDocument();
    });
  });

  it('pre-populates city and street from existing business data', async () => {
    await renderLoadedSection({ city: 'TLV', streetAddress: '1 Main' });

    expect(await screen.findByRole('textbox', { name: /^עיר/ })).toHaveValue('TLV');
    expect(screen.getByRole('textbox', { name: /^רחוב/ })).toHaveValue('1 Main');
  });

  it('accepts a valid 9-digit vatNumber without showing a validation error', async () => {
    vi.mocked(businessesApi.updateBusiness).mockResolvedValue({
      business: mockBusiness,
      role: 'owner' as const,
    });

    await renderLoadedSection();

    fireEvent.change(await screen.findByRole('textbox', { name: /מספר רישום מע״מ/ }), {
      target: { value: '123456789' },
    });
    submitSettingsForm();

    await waitFor(() => expect(businessesApi.updateBusiness).toHaveBeenCalled());
    expect(screen.queryByText('מספר רישום חייב להיות 9 ספרות')).not.toBeInTheDocument();
  });

  it('renders phone field labeled "טלפון לחשבונית" with accessible info button', async () => {
    await renderLoadedSection();

    expect(await screen.findByRole('textbox', { name: /טלפון לחשבונית/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'מידע על טלפון לחשבונית' })).toBeInTheDocument();
  });

  it('clicking "נסה שוב" in error state triggers refetch', async () => {
    vi.mocked(businessesApi.fetchBusiness).mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();

    renderSection();

    const retryBtn = await screen.findByRole('button', { name: 'נסה שוב' });
    vi.mocked(businessesApi.fetchBusiness).mockResolvedValue({
      business: mockBusiness,
      role: 'owner' as const,
    });
    await user.click(retryBtn);

    await waitFor(() => {
      expect(businessesApi.fetchBusiness).toHaveBeenCalledTimes(2);
    });
  });
});
