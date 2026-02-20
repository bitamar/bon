import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from '@mantine/form';
import type { CreateBusinessBody } from '@bon/types/businesses';
import { AddressAutocomplete } from '../../components/AddressAutocomplete';
import { renderWithProviders } from '../utils/renderWithProviders';

vi.mock('../../api/address', () => ({
  fetchAllCities: vi.fn(),
  fetchAllStreetsForCity: vi.fn(),
  filterOptions: vi.fn(),
}));

import * as addressApi from '../../api/address';

function TestForm() {
  const form = useForm<CreateBusinessBody>({
    initialValues: {
      name: '',
      businessType: 'licensed_dealer',
      registrationNumber: '',
      vatNumber: undefined,
      streetAddress: '',
      city: '',
      postalCode: undefined,
      phone: undefined,
      email: undefined,
      invoiceNumberPrefix: undefined,
      startingInvoiceNumber: 1,
      defaultVatRate: 1700,
    },
  });
  return <AddressAutocomplete form={form} />;
}

// ── helpers ──────────────────────────────────────────────────────────────────

type User = ReturnType<typeof userEvent.setup>;

async function selectCity(user: User, cityName: string) {
  await user.type(screen.getByRole('textbox', { name: /^עיר/ }), cityName);
  await waitFor(() => expect(screen.getByText(cityName)).toBeInTheDocument());
  await user.click(screen.getByText(cityName));
}

async function selectStreet(user: User, streetName: string) {
  await waitFor(() => expect(screen.getByRole('textbox', { name: /^רחוב/ })).not.toBeDisabled());
  await user.type(screen.getByRole('textbox', { name: /^רחוב/ }), streetName);
  await waitFor(() => expect(screen.getByText(streetName)).toBeInTheDocument());
  await user.click(screen.getByText(streetName));
}

async function renderAndSelectTelAviv(user: User) {
  vi.mocked(addressApi.fetchAllCities).mockResolvedValue([
    { name: 'תל אביב - יפו', code: '5000 ' },
  ]);
  renderWithProviders(<TestForm />);
  await selectCity(user, 'תל אביב - יפו');
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('AddressAutocomplete', () => {
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

  it('renders city, street, house number, apartment, and postal inputs', () => {
    renderWithProviders(<TestForm />);

    expect(screen.getByRole('textbox', { name: /^עיר/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^רחוב/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /מספר בית/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /דירה/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /מיקוד/ })).toBeInTheDocument();
  });

  it('street, house number, and apartment inputs are disabled before city is selected', () => {
    renderWithProviders(<TestForm />);

    expect(screen.getByRole('textbox', { name: /^רחוב/ })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /מספר בית/ })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /דירה/ })).toBeDisabled();
  });

  it('shows city dropdown options when typing', async () => {
    const user = userEvent.setup();
    vi.mocked(addressApi.fetchAllCities).mockResolvedValue([
      { name: 'תל אביב - יפו', code: '5000 ' },
      { name: 'ירושלים', code: '3000 ' },
    ]);

    renderWithProviders(<TestForm />);

    await user.type(screen.getByRole('textbox', { name: /^עיר/ }), 'תל');

    await waitFor(() => {
      expect(screen.getByText('תל אביב - יפו')).toBeInTheDocument();
    });
  });

  it('selecting a city enables street, house number, and apartment fields', async () => {
    const user = userEvent.setup();
    await renderAndSelectTelAviv(user);

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /^רחוב/ })).not.toBeDisabled();
      expect(screen.getByRole('textbox', { name: /מספר בית/ })).not.toBeDisabled();
      expect(screen.getByRole('textbox', { name: /דירה/ })).not.toBeDisabled();
    });
  });

  it('shows street dropdown and selecting a street populates the street field', async () => {
    const user = userEvent.setup();
    vi.mocked(addressApi.fetchAllStreetsForCity).mockResolvedValue([
      { name: 'דיזנגוף' },
      { name: 'ככר דיזנגוף' },
      { name: 'רוטשילד' },
    ]);
    await renderAndSelectTelAviv(user);
    await selectStreet(user, 'דיזנגוף');

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /^רחוב/ })).toHaveValue('דיזנגוף');
    });
  });

  it('typing in house number field does not reopen the street dropdown', async () => {
    const user = userEvent.setup();
    vi.mocked(addressApi.fetchAllStreetsForCity).mockResolvedValue([{ name: 'דיזנגוף' }]);
    await renderAndSelectTelAviv(user);
    await selectStreet(user, 'דיזנגוף');

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /^רחוב/ })).toHaveValue('דיזנגוף');
    });

    await user.type(screen.getByRole('textbox', { name: /מספר בית/ }), '5');

    expect(screen.getByRole('textbox', { name: /מספר בית/ })).toHaveValue('5');
    expect(screen.getByRole('textbox', { name: /^רחוב/ })).toHaveValue('דיזנגוף');
  });

  it('editing city after selection resets and disables street fields', async () => {
    const user = userEvent.setup();
    await renderAndSelectTelAviv(user);
    await waitFor(() => expect(screen.getByRole('textbox', { name: /^רחוב/ })).not.toBeDisabled());

    await user.clear(screen.getByRole('textbox', { name: /^עיר/ }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /^רחוב/ })).toBeDisabled();
      expect(screen.getByRole('textbox', { name: /מספר בית/ })).toBeDisabled();
    });
  });
});
