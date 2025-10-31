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

describe('Settings page', () => {
  const getSettingsMock = vi.mocked(authApi.getSettings);
  const updateSettingsMock = vi.mocked(authApi.updateSettings);

  beforeEach(() => {
    vi.resetAllMocks();
    getSettingsMock.mockResolvedValue({
      user: {
        id: 'u1',
        email: 'user@example.com',
        name: 'User Test',
        avatarUrl: null,
        phone: '050-9999999',
      },
    });
    mantineMocks.useMantineColorSchemeMock.mockReturnValue({
      colorScheme: 'light',
      setColorScheme: vi.fn(),
    });
  });

  afterEach(() => {
    mantineMocks.useMantineColorSchemeMock.mockReset();
  });

  it('renders user settings form with fetched data', async () => {
    renderWithProviders(<Settings />);

    await waitFor(() => expect(getSettingsMock).toHaveBeenCalled());

    expect(await screen.findByRole('heading', { name: 'Profile settings' })).toBeInTheDocument();
    expect(await screen.findByLabelText(/Name/)).toHaveValue('User Test');
    expect(await screen.findByLabelText(/Phone/)).toHaveValue('050-9999999');
  });

  it('submits updated settings', async () => {
    renderWithProviders(<Settings />);

    await waitFor(() => expect(getSettingsMock).toHaveBeenCalled());

    const nameInput = await screen.findByLabelText(/Name/);
    const phoneInput = await screen.findByLabelText(/Phone/);

    fireEvent.change(nameInput, { target: { value: 'New Name' } });
    fireEvent.change(phoneInput, { target: { value: '050-1111111' } });

    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateSettingsMock).toHaveBeenCalled());
    expect(updateSettingsMock.mock.calls[0]?.[0]).toEqual({
      name: 'New Name',
      phone: '050-1111111',
    });
  });

  it('toggles color scheme between light and dark', async () => {
    const setColorScheme = vi.fn();
    mantineMocks.useMantineColorSchemeMock.mockReturnValue({
      colorScheme: 'light',
      setColorScheme,
    });

    renderWithProviders(<Settings />);

    const themeToggle = await screen.findByRole('switch');
    const user = userEvent.setup();
    await user.click(themeToggle);

    expect(setColorScheme).toHaveBeenCalledWith('dark');
  });

  it('displays error message when fetch fails', async () => {
    getSettingsMock.mockRejectedValueOnce(new Error('Network error'));
    getSettingsMock.mockResolvedValueOnce({
      user: {
        id: 'u1',
        email: 'user@example.com',
        name: 'Recovered User',
        avatarUrl: null,
        phone: '050-9999999',
      },
    });

    renderWithProviders(<Settings />);

    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(getSettingsMock).toHaveBeenCalledTimes(2));
  });
});
