import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
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
  fetchAllCities: vi.fn().mockResolvedValue({ data: [], error: false }),
  fetchAllStreetsForCity: vi.fn().mockResolvedValue({ data: [], error: false }),
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
      <Route path="/businesses/:businessId/customers/new" element={<CustomerCreate />} />
      <Route
        path="/businesses/:businessId/customers/:customerId"
        element={<div>detail page</div>}
      />
    </Routes>,
    { router: { initialEntries: ['/businesses/biz-1/customers/new'] } }
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

function getTaxIdInput(taxIdType: 'company_id' | 'personal_id' | 'vat_number') {
  const labels: Record<string, string> = {
    company_id: 'מספר חברה (ח.פ.)',
    vat_number: 'מספר עוסק מורשה (ע.מ.)',
    personal_id: 'מספר תעודת זהות (ת.ז.)',
  };
  return screen.getByLabelText(labels[taxIdType]!);
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

  it('clicking ביטול navigates back to customers list', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/businesses/:businessId/customers/new" element={<CustomerCreate />} />
        <Route path="/businesses/:businessId/customers" element={<div>customers-list</div>} />
      </Routes>,
      { router: { initialEntries: ['/businesses/biz-1/customers/new'] } }
    );

    await user.click(screen.getByRole('button', { name: 'ביטול' }));

    expect(await screen.findByText('customers-list')).toBeInTheDocument();
  });
});

// Test tax ID validation via CustomerForm directly (avoids Select interaction in jsdom)
describe('CustomerForm tax ID validation', () => {
  it('shows validation error for taxId under 9 digits', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderFormWithTaxIdType('company_id');

    const taxIdInput = getTaxIdInput('company_id');
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

    const taxIdInput = getTaxIdInput('personal_id');
    await user.type(taxIdInput, '123456789');

    const nameInput = screen.getByRole('textbox', { name: /שם מלא/ });
    await user.type(nameInput, 'Test');

    const submitButton = screen.getByRole('button', { name: 'שמור' });
    await user.click(submitButton);

    expect(await screen.findByText('מספר ת.ז. לא תקין')).toBeInTheDocument();
  });

  it('accepts ח.פ. without checksum validation', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderFormWithTaxIdType('company_id');

    const taxIdInput = getTaxIdInput('company_id');
    await user.type(taxIdInput, '123456789');

    const nameInput = screen.getByRole('textbox', { name: /שם העסק/ });
    await user.type(nameInput, 'Test');

    const submitButton = screen.getByRole('button', { name: 'שמור' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ taxId: '123456789', taxIdType: 'company_id' }),
        expect.anything()
      );
    });
  });

  it('shows dynamic name label based on taxIdType', () => {
    renderFormWithTaxIdType('personal_id');
    expect(screen.getByRole('textbox', { name: /שם מלא/ })).toBeInTheDocument();
  });

  it('shows dynamic tax ID label per type', () => {
    const { unmount } = renderFormWithTaxIdType('company_id');
    expect(screen.getByLabelText('מספר חברה (ח.פ.)')).toBeInTheDocument();
    unmount();

    const { unmount: unmount2 } = renderFormWithTaxIdType('vat_number');
    expect(screen.getByLabelText('מספר עוסק מורשה (ע.מ.)')).toBeInTheDocument();
    unmount2();

    renderFormWithTaxIdType('personal_id');
    expect(screen.getByLabelText('מספר תעודת זהות (ת.ז.)')).toBeInTheDocument();
  });

  it('resets isLicensedDealer to false when taxId is cleared', async () => {
    const user = userEvent.setup();
    renderFormWithInitialValues({
      taxIdType: 'company_id',
      taxId: '123456782',
      isLicensedDealer: true,
    });

    const taxIdInput = getTaxIdInput('company_id');
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

  it('clears taxId when switching to "ללא מספר מזהה" via hidden Select option', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderFormWithInitialValues({
      taxIdType: 'company_id',
      taxId: '123456782',
    });

    // Mantine Select pre-renders all options hidden in the DOM; click directly
    const noneOption = screen.getByRole('option', { name: 'ללא מספר מזהה', hidden: true });
    fireEvent.click(noneOption);

    await waitFor(() => {
      // taxId field should be hidden (taxIdType is now 'none')
      expect(screen.queryByLabelText('מספר חברה (ח.פ.)')).not.toBeInTheDocument();
    });

    // Fill in the required name field and submit to verify taxId was cleared
    const nameInput = screen.getByRole('textbox', { name: /שם הלקוח/ });
    await user.type(nameInput, 'Test');

    await user.click(screen.getByRole('button', { name: 'שמור' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ taxId: '', taxIdType: 'none' }),
        expect.anything()
      );
    });
  });
});
