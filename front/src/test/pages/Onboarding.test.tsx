import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Onboarding } from '../../pages/Onboarding';
import { renderWithProviders } from '../utils/renderWithProviders';

vi.mock('../../api/businesses', () => ({
  createBusiness: vi.fn(),
}));

vi.mock('../../api/address', () => ({
  fetchAllCities: vi.fn(),
  fetchAllStreetsForCity: vi.fn(),
  filterOptions: vi.fn(),
}));

import * as businessesApi from '../../api/businesses';
import * as addressApi from '../../api/address';

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
    vi.mocked(addressApi.fetchAllCities).mockResolvedValue([]);
    vi.mocked(addressApi.fetchAllStreetsForCity).mockResolvedValue([]);
    vi.mocked(addressApi.filterOptions).mockImplementation(
      <T extends { name: string }>(options: T[], query: string): T[] => {
        const q = query.trim();
        if (!q) return options;
        return options.filter((o) => o.name.includes(q));
      }
    );
  });

  it('renders the form with "BON" title visible', () => {
    renderWithProviders(<Onboarding />);
    expect(screen.getByRole('heading', { name: 'BON' })).toBeInTheDocument();
  });

  it('step 0 renders with no pre-selected business type', () => {
    renderWithProviders(<Onboarding />);

    const licensedCard = screen.getByText('עוסק מורשה').closest('[role="radio"]');
    const exemptCard = screen.getByText('עוסק פטור').closest('[role="radio"]');
    const companyCard = screen.getByText('חברה בע״מ').closest('[role="radio"]');

    expect(licensedCard).toHaveAttribute('aria-checked', 'false');
    expect(exemptCard).toHaveAttribute('aria-checked', 'false');
    expect(companyCard).toHaveAttribute('aria-checked', 'false');
  });

  it('"המשך" on step 0 is disabled when no type is selected', () => {
    renderWithProviders(<Onboarding />);
    const nextButton = screen.getByRole('button', { name: 'המשך' });
    expect(nextButton).toBeDisabled();
  });

  it('selecting a type enables "המשך"', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Onboarding />);

    await user.click(screen.getByText('עוסק מורשה'));

    const nextButton = screen.getByRole('button', { name: 'המשך' });
    expect(nextButton).not.toBeDisabled();
  });

  it('clicking "המשך" on step 0 advances to step 1', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Onboarding />);

    await user.click(screen.getByText('עוסק מורשה'));
    await user.click(screen.getByRole('button', { name: 'המשך' }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /שם העסק/ })).toBeInTheDocument();
    });
  });

  it('step 1 shows correct fields for עוסק פטור (no VAT field)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Onboarding />);

    await user.click(screen.getByText('עוסק פטור'));
    await user.click(screen.getByRole('button', { name: 'המשך' }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /שם מלא/ })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /מספר תעודת זהות/ })).toBeInTheDocument();
    });

    expect(screen.queryByRole('textbox', { name: /מספר מע"מ/ })).not.toBeInTheDocument();
  });

  it('step 1 shows correct fields for עוסק מורשה (has VAT field)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Onboarding />);

    await user.click(screen.getByText('עוסק מורשה'));
    await user.click(screen.getByRole('button', { name: 'המשך' }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /שם העסק/ })).toBeInTheDocument();
      expect(
        screen.getByRole('textbox', { name: /מספר עוסק מורשה \(ע\.מ\.\)/ })
      ).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /מספר רישום מע״מ/ })).toBeInTheDocument();
    });
  });

  it('going back to step 0 and changing type resets step 1 fields', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Onboarding />);

    // Select licensed_dealer and go to step 1
    await user.click(screen.getByText('עוסק מורשה'));
    await user.click(screen.getByRole('button', { name: 'המשך' }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /שם העסק/ })).toBeInTheDocument();
    });

    // Fill in name
    await user.type(screen.getByRole('textbox', { name: /שם העסק/ }), 'My Business');

    // Go back to step 0
    await user.click(screen.getByRole('button', { name: 'חזרה' }));

    // Change to exempt_dealer
    await user.click(screen.getByText('עוסק פטור'));
    await user.click(screen.getByRole('button', { name: 'המשך' }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /שם מלא/ })).toHaveValue('');
    });
  });

  it('shows invalid ת.ז. error for עוסק פטור with wrong checksum', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Onboarding />);

    await user.click(screen.getByText('עוסק פטור'));
    await user.click(screen.getByRole('button', { name: 'המשך' }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /שם מלא/ })).toBeInTheDocument();
    });

    await user.type(screen.getByRole('textbox', { name: /שם מלא/ }), 'ישראל ישראלי');
    await user.type(screen.getByRole('textbox', { name: /מספר תעודת זהות/ }), '123456789');

    await user.click(screen.getByRole('button', { name: 'המשך' }));

    await waitFor(() => {
      expect(screen.getByText('מספר ת.ז. לא תקין')).toBeInTheDocument();
    });
  });

  it('registrationNumber blur auto-fills vatNumber for licensed_dealer when 9 digits', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Onboarding />);

    await user.click(screen.getByText('עוסק מורשה'));
    await user.click(screen.getByRole('button', { name: 'המשך' }));

    await waitFor(() => {
      expect(
        screen.getByRole('textbox', { name: /מספר עוסק מורשה \(ע\.מ\.\)/ })
      ).toBeInTheDocument();
    });

    const regInput = screen.getByRole('textbox', { name: /מספר עוסק מורשה \(ע\.מ\.\)/ });
    await user.click(regInput);
    await user.type(regInput, '123456789');
    await user.tab();

    await waitFor(() => {
      const vatInput = screen.getByRole('textbox', { name: /מספר רישום מע״מ/ });
      expect(vatInput).toHaveValue('123456789');
    });
  });

  it('successful submission calls createBusiness with correct payload for licensed_dealer', async () => {
    const user = userEvent.setup();

    vi.mocked(businessesApi.createBusiness).mockResolvedValue({
      business: mockCreatedBusiness,
      role: 'owner',
    });
    vi.mocked(addressApi.fetchAllCities).mockResolvedValue([{ name: 'TLV', code: '5000 ' }]);
    vi.mocked(addressApi.fetchAllStreetsForCity).mockResolvedValue([{ name: 'Main' }]);

    renderWithProviders(<Onboarding />);

    // Step 0: select type
    await user.click(screen.getByText('עוסק מורשה'));
    await user.click(screen.getByRole('button', { name: 'המשך' }));

    // Step 1: fill legal identity
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /שם העסק/ })).toBeInTheDocument();
    });

    await user.type(screen.getByRole('textbox', { name: /שם העסק/ }), 'New Co');

    const regInput = screen.getByRole('textbox', { name: /מספר עוסק מורשה \(ע\.מ\.\)/ });
    await user.type(regInput, '123456789');
    await user.tab();

    await waitFor(() => {
      const vatInput = screen.getByRole('textbox', { name: /מספר רישום מע״מ/ });
      expect(vatInput).toHaveValue('123456789');
    });

    await user.click(screen.getByRole('button', { name: 'המשך' }));

    // Step 2: select city → select street from dropdown → enter house number
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /^עיר/ })).toBeInTheDocument();
    });

    await user.type(screen.getByRole('textbox', { name: /^עיר/ }), 'TLV');
    await waitFor(() => expect(screen.getByText('TLV')).toBeInTheDocument());
    await user.click(screen.getByText('TLV'));

    await waitFor(() => expect(screen.getByRole('textbox', { name: /^רחוב/ })).not.toBeDisabled());

    await user.type(screen.getByRole('textbox', { name: /^רחוב/ }), 'Main');
    await waitFor(() => expect(screen.getByText('Main')).toBeInTheDocument());
    await user.click(screen.getByText('Main'));

    await user.type(screen.getByRole('textbox', { name: /מספר בית/ }), '1');

    await user.click(screen.getByRole('button', { name: /צור עסק והתחל להנפיק חשבוניות/ }));

    await waitFor(() => expect(businessesApi.createBusiness).toHaveBeenCalled());

    const payload = vi.mocked(businessesApi.createBusiness).mock.calls[0]?.[0];
    expect(payload?.name).toBe('New Co');
    expect(payload?.registrationNumber).toBe('123456789');
    expect(payload?.streetAddress).toBe('Main 1');
    expect(payload?.city).toBe('TLV');
    expect(payload?.businessType).toBe('licensed_dealer');
  });

  it('for עוסק פטור, payload has vatNumber undefined and defaultVatRate 0', async () => {
    const user = userEvent.setup();

    const exemptBusiness = {
      ...mockCreatedBusiness,
      businessType: 'exempt_dealer' as const,
      vatNumber: null,
      defaultVatRate: 0,
    };

    vi.mocked(businessesApi.createBusiness).mockResolvedValue({
      business: exemptBusiness,
      role: 'owner',
    });

    vi.mocked(addressApi.fetchAllCities).mockResolvedValue([{ name: 'TLV', code: '5000 ' }]);
    vi.mocked(addressApi.fetchAllStreetsForCity).mockResolvedValue([{ name: 'Main' }]);

    renderWithProviders(<Onboarding />);

    // Step 0: select exempt
    await user.click(screen.getByText('עוסק פטור'));
    await user.click(screen.getByRole('button', { name: 'המשך' }));

    // Step 1: fill legal identity
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /שם מלא/ })).toBeInTheDocument();
    });

    await user.type(screen.getByRole('textbox', { name: /שם מלא/ }), 'ישראל ישראלי');

    // Use a valid Israeli ID: 000000018 has checksum: 0*1+0*2+0*1+0*2+0*1+0*2+0*1+1*2+8*1 = 0+0+0+0+0+0+0+2+8=10 -> valid
    await user.type(screen.getByRole('textbox', { name: /מספר תעודת זהות/ }), '000000018');

    await user.click(screen.getByRole('button', { name: 'המשך' }));

    // Step 2: select city → select street from dropdown → enter house number
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /^עיר/ })).toBeInTheDocument();
    });

    await user.type(screen.getByRole('textbox', { name: /^עיר/ }), 'TLV');
    await waitFor(() => expect(screen.getByText('TLV')).toBeInTheDocument());
    await user.click(screen.getByText('TLV'));

    await waitFor(() => expect(screen.getByRole('textbox', { name: /^רחוב/ })).not.toBeDisabled());

    await user.type(screen.getByRole('textbox', { name: /^רחוב/ }), 'Main');
    await waitFor(() => expect(screen.getByText('Main')).toBeInTheDocument());
    await user.click(screen.getByText('Main'));

    await user.type(screen.getByRole('textbox', { name: /מספר בית/ }), '1');

    await user.click(screen.getByRole('button', { name: /צור עסק והתחל להנפיק חשבוניות/ }));

    await waitFor(() => expect(businessesApi.createBusiness).toHaveBeenCalled());

    const payload = vi.mocked(businessesApi.createBusiness).mock.calls[0]?.[0];
    expect(payload?.businessType).toBe('exempt_dealer');
    expect(payload?.vatNumber).toBeUndefined();
    expect(payload?.defaultVatRate).toBe(0);
  });
});
