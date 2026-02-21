import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { CustomerDetail } from '../../pages/CustomerDetail';
import { renderWithProviders } from '../utils/renderWithProviders';
import { HttpError } from '../../lib/http';

vi.mock('../../contexts/BusinessContext', () => ({ useBusiness: vi.fn() }));
vi.mock('../../api/customers', () => ({
  fetchCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
}));
vi.mock('../../api/address', () => ({
  fetchAllCities: vi.fn().mockResolvedValue([]),
  fetchAllStreetsForCity: vi.fn().mockResolvedValue([]),
  filterOptions: vi.fn(() => []),
}));

import { useBusiness } from '../../contexts/BusinessContext';
import * as customersApi from '../../api/customers';

// ── helpers ──

const activeBusinessStub = {
  id: 'biz-1',
  name: 'Test Co',
  businessType: 'licensed_dealer',
  role: 'owner',
};

function setupActiveBusiness() {
  vi.mocked(useBusiness).mockReturnValue({
    activeBusiness: activeBusinessStub,
    businesses: [],
    switchBusiness: vi.fn(),
    isLoading: false,
  });
}

function setupNoBusiness() {
  vi.mocked(useBusiness).mockReturnValue({
    activeBusiness: null,
    businesses: [],
    switchBusiness: vi.fn(),
    isLoading: false,
  });
}

const mockCustomer = {
  id: 'c1',
  businessId: 'biz-1',
  name: 'חברת אלפא',
  taxId: '123456782',
  taxIdType: 'company_id' as const,
  isLicensedDealer: true,
  email: 'alpha@test.com',
  phone: '0501234567',
  streetAddress: 'הרצל 1',
  city: 'תל אביב',
  postalCode: '6100000',
  contactName: 'דוד',
  notes: 'הערה פנימית',
  isActive: true,
  deletedAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function renderDetail() {
  return renderWithProviders(
    <Routes>
      <Route path="/business/customers/:customerId" element={<CustomerDetail />} />
    </Routes>,
    { router: { initialEntries: ['/business/customers/c1'] } }
  );
}

describe('CustomerDetail page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupActiveBusiness();
  });

  it('shows error when no active business', () => {
    setupNoBusiness();
    renderDetail();
    expect(screen.getByText('לא נבחר עסק')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    vi.mocked(customersApi.fetchCustomer).mockReturnValue(new Promise(() => {}));
    renderDetail();
    expect(screen.getByText('טוען פרטי לקוח...')).toBeInTheDocument();
  });

  it('shows error state with retry button', async () => {
    vi.mocked(customersApi.fetchCustomer).mockRejectedValue(new Error('fail'));
    renderDetail();
    expect(await screen.findByText('לא הצלחנו לטעון את פרטי הלקוח')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'נסה שוב' })).toBeInTheDocument();
  });

  it('loads and displays customer data', async () => {
    vi.mocked(customersApi.fetchCustomer).mockResolvedValue({ customer: mockCustomer });
    renderDetail();

    expect(await screen.findByRole('heading', { name: 'חברת אלפא' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /שם העסק/ })).toHaveValue('חברת אלפא');
    expect(screen.getByLabelText('מספר מזהה')).toHaveValue('123456782');
    expect(screen.getByRole('textbox', { name: /אימייל/ })).toHaveValue('alpha@test.com');
  });

  it('shows invoice history placeholder', async () => {
    vi.mocked(customersApi.fetchCustomer).mockResolvedValue({ customer: mockCustomer });
    renderDetail();

    expect(
      await screen.findByText('חשבוניות יוצגו כאן לאחר הוספת מודול חשבוניות')
    ).toBeInTheDocument();
  });

  it('updates customer on form submit', async () => {
    vi.mocked(customersApi.fetchCustomer).mockResolvedValue({ customer: mockCustomer });
    vi.mocked(customersApi.updateCustomer).mockResolvedValue({
      customer: { ...mockCustomer, name: 'שם חדש' },
    });
    const user = userEvent.setup();
    renderDetail();

    const nameInput = await screen.findByRole('textbox', { name: /שם העסק/ });
    await user.clear(nameInput);
    await user.type(nameInput, 'שם חדש');

    const submitButton = screen.getByRole('button', { name: 'שמור שינויים' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(customersApi.updateCustomer).toHaveBeenCalledWith(
        'biz-1',
        'c1',
        expect.objectContaining({ name: 'שם חדש' })
      );
    });
  });

  it('shows duplicate taxId inline error with link on edit', async () => {
    vi.mocked(customersApi.fetchCustomer).mockResolvedValue({ customer: mockCustomer });
    const duplicateError = new HttpError(409, 'duplicate_tax_id', {
      error: 'duplicate_tax_id',
      details: {
        existingCustomerId: 'other-c1',
        existingCustomerName: 'חברה אחרת',
      },
    });
    vi.mocked(customersApi.updateCustomer).mockRejectedValue(duplicateError);
    const user = userEvent.setup();
    renderDetail();

    await screen.findByRole('heading', { name: 'חברת אלפא' });

    const submitButton = screen.getByRole('button', { name: 'שמור שינויים' });
    await user.click(submitButton);

    expect(await screen.findByText(/מספר מזהה זה כבר קיים עבור חברה אחרת/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'עבור ללקוח הקיים' })).toHaveAttribute(
      'href',
      '/business/customers/other-c1'
    );
  });

  it('opens delete modal and deletes on confirm', async () => {
    vi.mocked(customersApi.fetchCustomer).mockResolvedValue({ customer: mockCustomer });
    vi.mocked(customersApi.deleteCustomer).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderDetail();

    await screen.findByRole('heading', { name: 'חברת אלפא' });

    const deleteButton = screen.getByRole('button', { name: 'הסר לקוח' });
    await user.click(deleteButton);

    expect(await screen.findByText(/האם להסיר את חברת אלפא/)).toBeInTheDocument();

    const confirmButton = screen.getByRole('button', { name: 'הסר' });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(customersApi.deleteCustomer).toHaveBeenCalledWith('biz-1', 'c1');
    });
  });
});
