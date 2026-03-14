import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { VatReport } from '../../pages/VatReport';
import { renderWithProviders } from '../utils/renderWithProviders';
import { useBusiness } from '../../contexts/BusinessContext';

vi.mock('../../contexts/BusinessContext', () => ({ useBusiness: vi.fn() }));
vi.mock('../../api/reports', () => ({ downloadPcn874: vi.fn() }));

// ── helpers ──

function renderVatReport() {
  return renderWithProviders(
    <Routes>
      <Route path="/businesses/:businessId/reports/vat" element={<VatReport />} />
    </Routes>,
    { router: { initialEntries: ['/businesses/biz-1/reports/vat'] } }
  );
}

const defaultBusiness = {
  activeBusiness: {
    id: 'biz-1',
    name: 'Test Business',
    businessType: 'licensed_dealer',
    role: 'owner' as const,
  },
  businesses: [],
  switchBusiness: vi.fn(),
  setActiveBusiness: vi.fn(),
  isLoading: false,
};

describe('VatReport page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(useBusiness).mockReturnValue(defaultBusiness);
  });

  it('renders title and download button for licensed dealer', () => {
    renderVatReport();

    expect(screen.getByText(/דוח מע"מ מפורט/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /הורד דוח מע"מ/ })).toBeInTheDocument();
  });

  it('renders month picker input', () => {
    renderVatReport();

    expect(screen.getByLabelText('תקופת דיווח')).toBeInTheDocument();
  });

  it('shows not-relevant alert for exempt_dealer', () => {
    vi.mocked(useBusiness).mockReturnValue({
      ...defaultBusiness,
      activeBusiness: {
        ...defaultBusiness.activeBusiness,
        businessType: 'exempt_dealer',
      },
    });

    renderVatReport();

    expect(screen.getByText(/עסק פטור אינו מדווח/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /הורד/ })).not.toBeInTheDocument();
  });
});
