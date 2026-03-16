import { vi } from 'vitest';
import type { useBusiness } from '../../contexts/BusinessContext';
import type { Business } from '@bon/types/businesses';

export const activeBusinessStub = {
  id: 'biz-1',
  name: 'Test Co',
  businessType: 'licensed_dealer',
  role: 'owner',
};

export function makeTestBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: 'biz-1',
    name: 'Test Co',
    businessType: 'licensed_dealer',
    registrationNumber: '123456782',
    vatNumber: '123456782',
    streetAddress: 'רחוב הרצל 1',
    city: 'תל אביב',
    postalCode: '1234567',
    phone: null,
    email: null,
    invoiceNumberPrefix: null,
    startingInvoiceNumber: 1,
    defaultVatRate: 1700,
    logoUrl: null,
    isActive: true,
    createdByUserId: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function mockActiveBusiness(useBusinessFn: typeof useBusiness) {
  vi.mocked(useBusinessFn).mockReturnValue({
    activeBusiness: activeBusinessStub,
    businesses: [],
    switchBusiness: vi.fn(),
    setActiveBusiness: vi.fn(),
    isLoading: false,
  });
}

export function mockMemberBusiness(useBusinessFn: typeof useBusiness) {
  vi.mocked(useBusinessFn).mockReturnValue({
    activeBusiness: { ...activeBusinessStub, role: 'member' },
    businesses: [],
    switchBusiness: vi.fn(),
    setActiveBusiness: vi.fn(),
    isLoading: false,
  });
}

export function mockNoBusiness(useBusinessFn: typeof useBusiness) {
  vi.mocked(useBusinessFn).mockReturnValue({
    activeBusiness: null,
    businesses: [],
    switchBusiness: vi.fn(),
    setActiveBusiness: vi.fn(),
    isLoading: false,
  });
}
