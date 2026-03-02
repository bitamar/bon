import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { CustomerSelect } from '../../components/CustomerSelect';
import { renderWithProviders } from '../utils/renderWithProviders';
import type { CustomerListResponse } from '@bon/types/customers';

vi.mock('../../api/customers', () => ({ fetchCustomers: vi.fn() }));

import * as customersApi from '../../api/customers';

// ── helpers ──

function renderSelect(value: string | null = null) {
  const onChange = vi.fn();
  const result = renderWithProviders(
    <CustomerSelect businessId="biz-1" value={value} onChange={onChange} />
  );
  return { ...result, onChange };
}

function makeListResponse(customers: CustomerListResponse['customers']): CustomerListResponse {
  return { customers };
}

function makeCustomer(
  overrides: Partial<CustomerListResponse['customers'][number]> = {}
): CustomerListResponse['customers'][number] {
  return {
    id: 'c-1',
    name: 'חברת אלפא',
    taxId: '123456789',
    taxIdType: 'company_id',
    isLicensedDealer: false,
    city: null,
    email: null,
    streetAddress: null,
    isActive: true,
    ...overrides,
  };
}

describe('CustomerSelect', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders without city in label when customer has no city', async () => {
    // Customer without city → label uses "name (taxId)" format (no city suffix)
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue(makeListResponse([makeCustomer()]));

    renderSelect();

    // Options are pre-rendered hidden; verify the input mounts without error
    expect(await screen.findByText('+ לקוח חדש')).toBeInTheDocument();

    // Verify label format is "name (taxId)" with no city suffix
    const option = await screen.findByRole('option', {
      name: /חברת אלפא.*123456789/,
      hidden: true,
    });
    expect(option).toBeInTheDocument();
    expect(option.textContent).not.toContain('—');
  });

  it('renders with city in label when customer has a city', async () => {
    // Customer with city → label uses "name (taxId) — city" format
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue(
      makeListResponse([
        makeCustomer({ id: 'c-2', name: 'חברת בטא', taxId: '987654321', city: 'תל אביב' }),
      ])
    );

    renderSelect();

    // Options are pre-rendered hidden in the DOM with display:none
    const option = await screen.findByRole('option', {
      name: /חברת בטא.*תל אביב/,
      hidden: true,
    });
    expect(option).toBeInTheDocument();
  });

  it('shows a loader while the query is pending', async () => {
    // Never resolves → query stays in loading state
    vi.mocked(customersApi.fetchCustomers).mockReturnValue(new Promise(() => {}));

    renderSelect();

    // React Query starts the fetch asynchronously; wait for the Loader to appear.
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  it('shows error message when query fails', async () => {
    vi.mocked(customersApi.fetchCustomers).mockRejectedValue(new Error('network'));

    renderSelect();

    expect(await screen.findByText('שגיאה בטעינת לקוחות')).toBeInTheDocument();
  });

  it('renders "לקוח חדש" anchor link', async () => {
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue(makeListResponse([]));

    renderSelect();

    expect(await screen.findByRole('link', { name: '+ לקוח חדש' })).toBeInTheDocument();
  });
});
