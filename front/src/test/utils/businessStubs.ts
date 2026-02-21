import { vi } from 'vitest';
import type { useBusiness } from '../../contexts/BusinessContext';

export const activeBusinessStub = {
  id: 'biz-1',
  name: 'Test Co',
  businessType: 'licensed_dealer',
  role: 'owner',
};

export function mockActiveBusiness(useBusinessFn: typeof useBusiness) {
  vi.mocked(useBusinessFn).mockReturnValue({
    activeBusiness: activeBusinessStub,
    businesses: [],
    switchBusiness: vi.fn(),
    isLoading: false,
  });
}

export function mockNoBusiness(useBusinessFn: typeof useBusiness) {
  vi.mocked(useBusinessFn).mockReturnValue({
    activeBusiness: null,
    businesses: [],
    switchBusiness: vi.fn(),
    isLoading: false,
  });
}
