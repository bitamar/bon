import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { CustomerCreate } from '../../pages/CustomerCreate';
import { CustomerForm, type CustomerFormValues } from '../../components/CustomerForm';
import { renderWithProviders } from '../utils/renderWithProviders';

vi.mock('../../contexts/BusinessContext', () => ({ useBusiness: vi.fn() }));
vi.mock('../../api/customers', () => ({
  createCustomer: vi.fn(),
}));
vi.mock('../../api/address', () => ({
  fetchAllCities: vi.fn().mockResolvedValue([]),
  fetchAllStreetsForCity: vi.fn().mockResolvedValue([]),
  filterOptions: vi.fn(() => []),
}));
vi.mock('../../lib/notifications', () => ({
  showErrorNotification: vi.fn(),
  showSuccessNotification: vi.fn(),
  extractErrorMessage: vi.fn((error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) return error.message;
    return fallback;
  }),
}));

import { useBusiness } from '../../contexts/BusinessContext';
import * as customersApi from '../../api/customers';
import { showErrorNotification } from '../../lib/notifications';
import { mockActiveBusiness, mockNoBusiness } from '../utils/businessStubs';

const mockCustomerResponse = {
  customer: {
    id: 'new-c1',
    businessId: 'biz-1',
    name: 'Test Customer',
    taxId: null,
    taxIdType: 'none' as const,
    isLicensedDealer: false,
    email: null,
    phone: null,
    streetAddress: null,
    city: null,
    postalCode: null,
    contactName: null,
    notes: null,
    isActive: true,
    deletedAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
};

function renderCreate() {
  return renderWithProviders(
    <Routes>
      <Route path="/business/customers/new" element={<CustomerCreate />} />
      <Route path="/business/customers/:customerId" element={<div>detail page</div>} />
    </Routes>,
    { router: { initialEntries: ['/business/customers/new'] } }
  );
}

function renderFormWithTaxIdType(taxIdType: 'company_id' | 'personal_id' | 'vat_number') {
  const onSubmit = vi.fn();
  return {
    onSubmit,
    ...renderWithProviders(
      <CustomerForm
        initialValues={{ taxIdType }}
        onSubmit={onSubmit}
        isPending={false}
        submitLabel="שמור"
        cancelLabel="ביטול"
        onCancel={vi.fn()}
      />
    ),
  };
}

function renderFormWithInitialValues(initialValues: Partial<CustomerFormValues>) {
  const onSubmit = vi.fn();
  return {
    onSubmit,
    ...renderWithProviders(
      <CustomerForm
        initialValues={initialValues}
        onSubmit={onSubmit}
        isPending={false}
        submitLabel="שמור"
        cancelLabel="ביטול"
        onCancel={vi.fn()}
      />
    ),
  };
}

function getTaxIdInput() {
  // Use exact label match to avoid matching "סוג מספר מזהה" Select
  return screen.getByLabelText('מספר מזהה');
}

describe('CustomerCreate page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockActiveBusiness(useBusiness);
  });

  it('shows error when no active business', () => {
    mockNoBusiness(useBusiness);
    renderCreate();
    expect(screen.getByText('לא נבחר עסק')).toBeInTheDocument();
  });

  it('submits with name only and navigates on success', async () => {
    vi.mocked(customersApi.createCustomer).mockResolvedValue(mockCustomerResponse);
    const user = userEvent.setup();

    renderCreate();

    const nameInput = screen.getByRole('textbox', { name: /שם הלקוח/ });
    await user.type(nameInput, 'Test Customer');

    const submitButton = screen.getByRole('button', { name: 'שמור' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(customersApi.createCustomer).toHaveBeenCalledWith(
        'biz-1',
        expect.objectContaining({ name: 'Test Customer' })
      );
    });
  });

  it('shows validation error when name is empty', async () => {
    const user = userEvent.setup();

    renderCreate();

    const submitButton = screen.getByRole('button', { name: 'שמור' });
    await user.click(submitButton);

    expect(await screen.findByText('שם נדרש')).toBeInTheDocument();
    expect(customersApi.createCustomer).not.toHaveBeenCalled();
  });

  it('shows error notification on generic API failure', async () => {
    vi.mocked(customersApi.createCustomer).mockRejectedValue(new Error('Server error'));
    const user = userEvent.setup();

    renderCreate();

    const nameInput = screen.getByRole('textbox', { name: /שם הלקוח/ });
    await user.type(nameInput, 'Test Name');

    const submitButton = screen.getByRole('button', { name: 'שמור' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(showErrorNotification).toHaveBeenCalled();
    });
  });
});

// Test tax ID validation via CustomerForm directly (avoids Select interaction in jsdom)
describe('CustomerForm tax ID validation', () => {
  it('shows validation error for taxId under 9 digits', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderFormWithTaxIdType('company_id');

    const taxIdInput = getTaxIdInput();
    await user.type(taxIdInput, '12345');

    const nameInput = screen.getByRole('textbox', { name: /שם העסק/ });
    await user.type(nameInput, 'Test');

    const submitButton = screen.getByRole('button', { name: 'שמור' });
    await user.click(submitButton);

    expect(await screen.findByText('מספר מזהה חייב להיות 9 ספרות')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows checksum error for invalid ת.ז.', async () => {
    const user = userEvent.setup();
    renderFormWithTaxIdType('personal_id');

    const taxIdInput = getTaxIdInput();
    await user.type(taxIdInput, '123456789');

    const nameInput = screen.getByRole('textbox', { name: /שם מלא/ });
    await user.type(nameInput, 'Test');

    const submitButton = screen.getByRole('button', { name: 'שמור' });
    await user.click(submitButton);

    expect(await screen.findByText('מספר ת.ז. לא תקין')).toBeInTheDocument();
  });

  it('shows checksum error for invalid ח.פ.', async () => {
    const user = userEvent.setup();
    renderFormWithTaxIdType('company_id');

    const taxIdInput = getTaxIdInput();
    await user.type(taxIdInput, '123456789');

    const nameInput = screen.getByRole('textbox', { name: /שם העסק/ });
    await user.type(nameInput, 'Test');

    const submitButton = screen.getByRole('button', { name: 'שמור' });
    await user.click(submitButton);

    expect(await screen.findByText('מספר מזהה לא תקין (ספרת ביקורת)')).toBeInTheDocument();
  });

  it('shows dynamic name label based on taxIdType', () => {
    renderFormWithTaxIdType('personal_id');
    expect(screen.getByRole('textbox', { name: /שם מלא/ })).toBeInTheDocument();
  });

  it('resets isLicensedDealer to false when taxId is cleared', async () => {
    const user = userEvent.setup();
    renderFormWithInitialValues({
      taxIdType: 'company_id',
      taxId: '123456782',
      isLicensedDealer: true,
    });

    const taxIdInput = getTaxIdInput();
    await user.tripleClick(taxIdInput);
    await user.keyboard('{Backspace}');

    await waitFor(() => {
      expect(screen.queryByRole('switch', { name: /עוסק מורשה/ })).not.toBeInTheDocument();
    });
  });

  it('shows and toggles the licensed dealer Switch when taxId is filled', async () => {
    const user = userEvent.setup();
    renderFormWithInitialValues({ taxIdType: 'company_id', taxId: '123456782' });

    const toggle = await screen.findByRole('switch', { name: /עוסק מורשה/ });
    expect(toggle).not.toBeChecked();

    await user.click(toggle);

    expect(screen.getByRole('switch', { name: /עוסק מורשה/ })).toBeChecked();
  });
});
