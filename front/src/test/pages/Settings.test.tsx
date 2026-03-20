import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const mantineMocks = vi.hoisted(() => ({
  useMantineColorSchemeMock: vi.fn(),
}));

vi.mock('@mantine/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mantine/core')>();
  return {
    ...actual,
    useMantineColorScheme: mantineMocks.useMantineColorSchemeMock,
  };
});

import { Settings } from '../../pages/Settings';
import * as authApi from '../../auth/api';
import { renderWithProviders } from '../utils/renderWithProviders';

vi.mock('../../auth/api');
vi.mock('../../contexts/BusinessContext', () => ({ useBusiness: vi.fn() }));
vi.mock('../../api/businesses', () => ({
  fetchBusiness: vi.fn(),
  updateBusiness: vi.fn(),
}));
vi.mock('../../api/address', () => ({
  fetchAllCities: vi.fn().mockResolvedValue([]),
  fetchAllStreetsForCity: vi.fn().mockResolvedValue([]),
  filterOptions: vi.fn(() => []),
}));

import { useBusiness } from '../../contexts/BusinessContext';
import * as businessesApi from '../../api/businesses';
import { activeBusinessStub } from '../utils/businessStubs';

// ── helpers ──

const DEFAULT_USER = {
  id: 'u1',
  email: 'user@example.com',
  name: 'User Test',
  avatarUrl: null,
  phone: '050-9999999',
  whatsappEnabled: true,
};

function mockUseBusinessWith(
  overrides: Partial<typeof activeBusinessStub> & { role?: string } = {}
) {
  const activeBusiness =
    Object.keys(overrides).length > 0 ? { ...activeBusinessStub, ...overrides } : null;
  vi.mocked(useBusiness).mockReturnValue({
    activeBusiness,
    businesses: [],
    switchBusiness: vi.fn(),
    setActiveBusiness: vi.fn(),
    isLoading: false,
  });
}

describe('Settings page', () => {
  const getSettingsMock = vi.mocked(authApi.getSettings);
  const updateSettingsMock = vi.mocked(authApi.updateSettings);

  beforeEach(() => {
    vi.resetAllMocks();
    mockUseBusinessWith();
    getSettingsMock.mockResolvedValue({ user: DEFAULT_USER });
    mantineMocks.useMantineColorSchemeMock.mockReturnValue({
      colorScheme: 'light',
      setColorScheme: vi.fn(),
    });
  });

  afterEach(() => {
    mantineMocks.useMantineColorSchemeMock.mockReset();
  });

  it('renders user settings form with fetched data including WhatsApp fields', async () => {
    renderWithProviders(<Settings />);

    await waitFor(() => expect(getSettingsMock).toHaveBeenCalled());

    expect(await screen.findByRole('heading', { name: 'הגדרות' })).toBeInTheDocument();
    expect(await screen.findByLabelText(/שם/)).toHaveValue('User Test');
    expect(await screen.findByLabelText(/טלפון נייד/)).toHaveValue('050-9999999');
    expect(await screen.findByLabelText(/קבלת הודעות WhatsApp/)).toBeChecked();
  });

  it('submits updated settings with whatsappEnabled', async () => {
    renderWithProviders(<Settings />);

    await waitFor(() => expect(getSettingsMock).toHaveBeenCalled());

    const nameInput = await screen.findByLabelText(/שם/);
    const phoneInput = await screen.findByLabelText(/טלפון נייד/);

    fireEvent.change(nameInput, { target: { value: 'New Name' } });
    fireEvent.change(phoneInput, { target: { value: '050-1111111' } });

    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'שמור שינויים' }));

    await waitFor(() => expect(updateSettingsMock).toHaveBeenCalled());
    expect(updateSettingsMock.mock.calls[0]?.[0]).toEqual({
      name: 'New Name',
      phone: '050-1111111',
      whatsappEnabled: true,
    });
  });

  it('toggles whatsappEnabled off and submits', async () => {
    renderWithProviders(<Settings />);

    await waitFor(() => expect(getSettingsMock).toHaveBeenCalled());

    const user = userEvent.setup();
    const whatsappToggle = await screen.findByLabelText(/קבלת הודעות WhatsApp/);
    await user.click(whatsappToggle);

    await user.click(screen.getByRole('button', { name: 'שמור שינויים' }));

    await waitFor(() => expect(updateSettingsMock).toHaveBeenCalled());
    expect(updateSettingsMock.mock.calls[0]?.[0]).toMatchObject({
      whatsappEnabled: false,
    });
  });

  it('shows phone validation error for invalid format', async () => {
    renderWithProviders(<Settings />);

    await waitFor(() => expect(getSettingsMock).toHaveBeenCalled());

    const phoneInput = await screen.findByLabelText(/טלפון נייד/);
    fireEvent.change(phoneInput, { target: { value: '123' } });
    fireEvent.blur(phoneInput);

    expect(await screen.findByText('מספר טלפון לא תקין')).toBeInTheDocument();
  });

  it('does not submit when phone validation fails', async () => {
    renderWithProviders(<Settings />);

    await waitFor(() => expect(getSettingsMock).toHaveBeenCalled());

    const phoneInput = await screen.findByLabelText(/טלפון נייד/);
    fireEvent.change(phoneInput, { target: { value: 'abc' } });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'שמור שינויים' }));

    expect(updateSettingsMock).not.toHaveBeenCalled();
  });

  it('toggles color scheme between light and dark', async () => {
    const setColorScheme = vi.fn();
    mantineMocks.useMantineColorSchemeMock.mockReturnValue({
      colorScheme: 'light',
      setColorScheme,
    });

    renderWithProviders(<Settings />);

    const themeToggle = await screen.findByRole('switch', { name: 'מצב כהה' });
    const user = userEvent.setup();
    await user.click(themeToggle);

    expect(setColorScheme).toHaveBeenCalledWith('dark');
  });

  it('displays error message when fetch fails', async () => {
    getSettingsMock.mockRejectedValueOnce(new Error('Network error'));
    getSettingsMock.mockResolvedValueOnce({ user: DEFAULT_USER });

    renderWithProviders(<Settings />);

    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'נסה שוב' }));
    await waitFor(() => expect(getSettingsMock).toHaveBeenCalledTimes(2));
  });

  it('populates name and phone as empty string when fetched values are null', async () => {
    getSettingsMock.mockResolvedValue({
      user: {
        id: 'u1',
        email: 'user@example.com',
        name: null,
        avatarUrl: null,
        phone: null,
        whatsappEnabled: true,
      },
    });

    renderWithProviders(<Settings />);

    await waitFor(() => expect(getSettingsMock).toHaveBeenCalled());

    expect(await screen.findByLabelText(/שם/)).toHaveValue('');
    expect(await screen.findByLabelText(/טלפון נייד/)).toHaveValue('');
  });

  it('submits null for name and phone when inputs are blank or whitespace-only', async () => {
    renderWithProviders(<Settings />);

    await waitFor(() => expect(getSettingsMock).toHaveBeenCalled());

    const nameInput = await screen.findByLabelText(/שם/);
    const phoneInput = await screen.findByLabelText(/טלפון נייד/);

    fireEvent.change(nameInput, { target: { value: '   ' } });
    fireEvent.change(phoneInput, { target: { value: '   ' } });

    const user = userEvent.setup();
    updateSettingsMock.mockResolvedValue({
      user: {
        id: 'u1',
        email: 'user@example.com',
        name: null,
        avatarUrl: null,
        phone: null,
        whatsappEnabled: true,
      },
    });

    await user.click(screen.getByRole('button', { name: 'שמור שינויים' }));

    await waitFor(() => expect(updateSettingsMock).toHaveBeenCalled());
    expect(updateSettingsMock.mock.calls[0]?.[0]).toEqual({
      name: null,
      phone: null,
      whatsappEnabled: true,
    });
  });

  it('shows business settings section for owner', async () => {
    mockUseBusinessWith({ role: 'owner' });
    vi.mocked(businessesApi.fetchBusiness).mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<Settings />);

    await waitFor(() => expect(getSettingsMock).toHaveBeenCalled());

    await waitFor(() => expect(screen.getByTestId('form-skeleton')).toBeInTheDocument());
  });

  it('hides business settings section for non-owner', async () => {
    mockUseBusinessWith({ role: 'user' });

    renderWithProviders(<Settings />);

    await waitFor(() => expect(getSettingsMock).toHaveBeenCalled());

    expect(screen.queryByText('הגדרות עסק')).not.toBeInTheDocument();
  });
});
