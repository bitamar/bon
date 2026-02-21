import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomerList } from '../../pages/CustomerList';
import { renderWithProviders } from '../utils/renderWithProviders';

vi.mock('../../contexts/BusinessContext', () => ({ useBusiness: vi.fn() }));
vi.mock('../../api/customers', () => ({
  fetchCustomers: vi.fn(),
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

describe('CustomerList page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupActiveBusiness();
  });

  it('shows error when no active business', () => {
    setupNoBusiness();
    renderWithProviders(<CustomerList />);
    expect(screen.getByText('לא נבחר עסק')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    vi.mocked(customersApi.fetchCustomers).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<CustomerList />);
    expect(screen.getByText('טוען לקוחות...')).toBeInTheDocument();
  });

  it('shows error state with retry', async () => {
    vi.mocked(customersApi.fetchCustomers).mockRejectedValue(new Error('fail'));
    renderWithProviders(<CustomerList />);
    expect(await screen.findByText('לא הצלחנו לטעון את רשימת הלקוחות')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'נסה שוב' })).toBeInTheDocument();
  });

  it('renders customer list with formatted data', async () => {
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue({ customers: mockCustomers });
    renderWithProviders(<CustomerList />);

    expect(await screen.findByText('חברת אלפא')).toBeInTheDocument();
    expect(screen.getByText('51-2345678')).toBeInTheDocument();
    expect(screen.getByText('תל אביב')).toBeInTheDocument();
    expect(screen.getByText('עוסק מורשה')).toBeInTheDocument();

    expect(screen.getByText('יוסי כהן')).toBeInTheDocument();
    expect(screen.getByText('ללא מספר מזהה')).toBeInTheDocument();
  });

  it('shows inactive badge for inactive customers', async () => {
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue({ customers: mockCustomers });
    renderWithProviders(<CustomerList />);

    expect(await screen.findByText('לא פעיל')).toBeInTheDocument();
  });

  it('renders rows as links to detail page', async () => {
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue({
      customers: [mockCustomers[0]!],
    });
    renderWithProviders(<CustomerList />);

    const link = await screen.findByRole('link', { name: /חברת אלפא/ });
    expect(link).toHaveAttribute('href', '/business/customers/c1');
  });

  it('shows empty state with CTA when no customers', async () => {
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue({ customers: [] });
    renderWithProviders(<CustomerList />);

    expect(await screen.findByText('עדיין אין לקוחות')).toBeInTheDocument();
    expect(screen.getByText('הוסיפו לקוח ראשון כדי להתחיל ליצור חשבוניות')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'הוסף לקוח ראשון' })).toBeInTheDocument();
  });

  it('shows not-found state when search yields no results', async () => {
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue({ customers: [] });
    const user = userEvent.setup();
    renderWithProviders(<CustomerList />);

    const searchInput = await screen.findByPlaceholderText('חיפוש לפי שם או מספר מזהה...');
    await user.type(searchInput, 'nonexistent');

    // fetchCustomers is called again with the debounced search
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue({ customers: [] });

    expect(await screen.findByText('לא נמצאו לקוחות')).toBeInTheDocument();
  });

  it('calls fetchCustomers with limit=200', async () => {
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue({ customers: [] });
    renderWithProviders(<CustomerList />);

    await screen.findByText('עדיין אין לקוחות');
    expect(customersApi.fetchCustomers).toHaveBeenCalledWith('biz-1', undefined, undefined, 200);
  });
});
