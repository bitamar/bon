import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { CustomerList } from '../../pages/CustomerList';
import { renderWithProviders } from '../utils/renderWithProviders';

vi.mock('../../contexts/BusinessContext', () => ({ useBusiness: vi.fn() }));
vi.mock('../../api/customers', () => ({
  fetchCustomers: vi.fn(),
}));
vi.mock('../../lib/notifications', () => ({
  extractErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
}));

import { useBusiness } from '../../contexts/BusinessContext';
import * as customersApi from '../../api/customers';
import { mockActiveBusiness, mockNoBusiness } from '../utils/businessStubs';

const mockCustomers = [
  {
    id: 'c1',
    name: 'חברת אלפא',
    taxId: '512345678',
    taxIdType: 'company_id' as const,
    isLicensedDealer: true,
    city: 'תל אביב',
    email: 'alpha@test.com',
    streetAddress: 'הרצל 1',
    isActive: true,
  },
  {
    id: 'c2',
    name: 'יוסי כהן',
    taxId: null,
    taxIdType: 'none' as const,
    isLicensedDealer: false,
    city: null,
    email: null,
    streetAddress: null,
    isActive: true,
  },
  {
    id: 'c3',
    name: 'עסק לא פעיל',
    taxId: '123456782',
    taxIdType: 'vat_number' as const,
    isLicensedDealer: false,
    city: 'חיפה',
    email: null,
    streetAddress: null,
    isActive: false,
  },
];

// ── helpers ──

function renderCustomerList() {
  return renderWithProviders(
    <Routes>
      <Route path="/businesses/:businessId/customers" element={<CustomerList />} />
      <Route path="/businesses/:businessId/customers/new" element={<div>new-customer-page</div>} />
    </Routes>,
    { router: { initialEntries: ['/businesses/biz-1/customers'] } }
  );
}

describe('CustomerList page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockActiveBusiness(useBusiness);
  });

  it('shows error when no active business', () => {
    mockNoBusiness(useBusiness);
    renderCustomerList();
    expect(screen.getByText('לא נבחר עסק')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    vi.mocked(customersApi.fetchCustomers).mockReturnValue(new Promise(() => {}));
    renderCustomerList();
    expect(screen.getByText('טוען לקוחות...')).toBeInTheDocument();
  });

  it('shows error state with retry', async () => {
    vi.mocked(customersApi.fetchCustomers).mockRejectedValue(new Error('fail'));
    renderCustomerList();
    await waitFor(() => {
      expect(screen.getAllByText('לא הצלחנו לטעון את רשימת הלקוחות')[0]).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'נסה שוב' })).toBeInTheDocument();
  });

  it('renders customer list with formatted data', async () => {
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue({ customers: mockCustomers });
    renderCustomerList();

    expect(await screen.findByText('חברת אלפא')).toBeInTheDocument();
    expect(screen.getByText('51-2345678')).toBeInTheDocument();
    expect(screen.getByText('תל אביב')).toBeInTheDocument();
    expect(screen.getByText('עוסק מורשה')).toBeInTheDocument();

    expect(screen.getByText('יוסי כהן')).toBeInTheDocument();
    expect(screen.getByText('ללא מספר מזהה')).toBeInTheDocument();
  });

  it('shows inactive badge for inactive customers', async () => {
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue({ customers: mockCustomers });
    renderCustomerList();

    expect(await screen.findByText('לא פעיל')).toBeInTheDocument();
  });

  it('renders rows as links to detail page', async () => {
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue({
      customers: [mockCustomers[0]!],
    });
    renderCustomerList();

    const link = await screen.findByRole('link', { name: /חברת אלפא/ });
    expect(link).toHaveAttribute('href', '/businesses/biz-1/customers/c1');
  });

  it('shows empty state with CTA when no customers', async () => {
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue({ customers: [] });
    renderCustomerList();

    expect(await screen.findByText('עדיין אין לקוחות')).toBeInTheDocument();
    expect(screen.getByText('הוסיפו לקוח ראשון כדי להתחיל ליצור חשבוניות')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'הוסף לקוח ראשון' })).toBeInTheDocument();
  });

  it('shows not-found state when search yields no results', async () => {
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue({ customers: [] });
    const user = userEvent.setup();
    renderCustomerList();

    const searchInput = await screen.findByPlaceholderText('חיפוש לפי שם או מספר מזהה...');
    await user.type(searchInput, 'nonexistent');

    // fetchCustomers is called again with the debounced search
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue({ customers: [] });

    expect(await screen.findByText('לא נמצאו לקוחות')).toBeInTheDocument();
  });

  it('calls fetchCustomers with limit=200', async () => {
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue({ customers: [] });
    renderCustomerList();

    await screen.findByText('עדיין אין לקוחות');
    expect(customersApi.fetchCustomers).toHaveBeenCalledWith('biz-1', undefined, undefined, 200);
  });

  it('clicking "לקוח חדש" navigates to the new customer page', async () => {
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue({ customers: mockCustomers });
    const user = userEvent.setup();
    renderCustomerList();

    await screen.findByText('חברת אלפא');
    await user.click(screen.getByRole('button', { name: /לקוח חדש/ }));

    expect(await screen.findByText('new-customer-page')).toBeInTheDocument();
  });

  it('retry button triggers refetch after error', async () => {
    vi.mocked(customersApi.fetchCustomers).mockRejectedValue(new Error('fail'));
    const user = userEvent.setup();
    renderCustomerList();

    await waitFor(() => {
      expect(screen.getAllByText('לא הצלחנו לטעון את רשימת הלקוחות')[0]).toBeInTheDocument();
    });

    vi.mocked(customersApi.fetchCustomers).mockResolvedValue({ customers: mockCustomers });
    await user.click(screen.getByRole('button', { name: 'נסה שוב' }));

    await waitFor(() => {
      expect(screen.getByText('חברת אלפא')).toBeInTheDocument();
    });
  });

  it('clicking "הוסף לקוח ראשון" in empty state navigates to new customer page', async () => {
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue({ customers: [] });
    const user = userEvent.setup();
    renderCustomerList();

    await screen.findByText('עדיין אין לקוחות');
    await user.click(screen.getByRole('button', { name: 'הוסף לקוח ראשון' }));

    expect(await screen.findByText('new-customer-page')).toBeInTheDocument();
  });
});
