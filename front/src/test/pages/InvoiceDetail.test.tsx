import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { InvoiceDetail } from '../../pages/InvoiceDetail';
import { renderWithProviders } from '../utils/renderWithProviders';
import type { Invoice, InvoiceStatus } from '@bon/types/invoices';

vi.mock('../../contexts/BusinessContext', () => ({ useBusiness: vi.fn() }));
vi.mock('../../api/invoices', () => ({
  fetchInvoice: vi.fn(),
}));

import { useBusiness } from '../../contexts/BusinessContext';
import * as invoicesApi from '../../api/invoices';
import { mockActiveBusiness, mockNoBusiness } from '../utils/businessStubs';
import { makeFinalizedInvoice } from '../utils/invoiceStubs';

function renderDetail() {
  return renderWithProviders(
    <Routes>
      <Route path="/businesses/:businessId/invoices/:invoiceId" element={<InvoiceDetail />} />
      <Route
        path="/businesses/:businessId/invoices/:invoiceId/edit"
        element={<div>edit-page</div>}
      />
    </Routes>,
    { router: { initialEntries: ['/businesses/biz-1/invoices/inv-1'] } }
  );
}

function renderWithInvoice(overrides: Partial<Invoice> = {}) {
  vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(makeFinalizedInvoice(overrides));
  return renderDetail();
}

describe('InvoiceDetail page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockActiveBusiness(useBusiness);
    vi.mocked(invoicesApi.fetchInvoice).mockReturnValue(new Promise(() => {}));
  });

  it('shows error when no active business', () => {
    mockNoBusiness(useBusiness);
    renderDetail();
    expect(screen.getByText('לא נבחר עסק')).toBeInTheDocument();
  });

  it('shows loading skeleton', () => {
    vi.mocked(invoicesApi.fetchInvoice).mockReturnValue(new Promise(() => {}));
    renderDetail();
    expect(screen.getByTestId('invoice-loading')).toBeInTheDocument();
  });

  it('shows error state with retry button', async () => {
    vi.mocked(invoicesApi.fetchInvoice).mockRejectedValue(new Error('network'));
    renderDetail();

    expect(await screen.findByText('לא הצלחנו לטעון את החשבונית')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'נסה שוב' })).toBeInTheDocument();
  });

  it('renders all required fields for a finalized invoice', async () => {
    renderWithInvoice();

    // Document number
    expect(await screen.findByText('INV-0001')).toBeInTheDocument();

    // Status badge
    expect(screen.getByText('הופקה')).toBeInTheDocument();

    // Document type
    expect(screen.getByText('חשבונית מס')).toBeInTheDocument();

    // Customer info
    expect(screen.getByText('לקוח לדוגמה')).toBeInTheDocument();
    expect(screen.getByText('123456782')).toBeInTheDocument();
    expect(screen.getByText('רחוב הרצל 1, תל אביב')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();

    // Line item
    expect(screen.getByText('שירות ייעוץ')).toBeInTheDocument();

    // Notes
    expect(screen.getByText('הערה לדוגמה')).toBeInTheDocument();

    // Action buttons
    expect(screen.getByRole('button', { name: 'הורד PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'שלח במייל' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'סמן כשולם' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'הפק חשבונית זיכוי' })).toBeDisabled();
  });

  it.each([
    ['finalized', 'הופקה'],
    ['sent', 'נשלחה'],
    ['paid', 'שולמה'],
    ['partially_paid', 'שולמה חלקית'],
    ['cancelled', 'בוטלה'],
    ['credited', 'זוכתה'],
  ] as const)(
    'shows correct status banner for %s',
    async (status: InvoiceStatus, label: string) => {
      renderWithInvoice({ status });

      expect(await screen.findByText(label)).toBeInTheDocument();
    }
  );

  it('redirects draft to edit page', async () => {
    renderWithInvoice({ status: 'draft' });

    expect(await screen.findByText('edit-page')).toBeInTheDocument();
  });

  it('shows credit note button only for eligible statuses', async () => {
    renderWithInvoice({ status: 'cancelled' });

    await screen.findByText('בוטלה');

    expect(screen.queryByRole('button', { name: 'הפק חשבונית זיכוי' })).not.toBeInTheDocument();
  });

  it('shows allocation number when present', async () => {
    renderWithInvoice({ allocationNumber: 'ALLOC-12345' });

    expect(await screen.findByText('ALLOC-12345')).toBeInTheDocument();
    expect(screen.getByText('מספר הקצאה:')).toBeInTheDocument();
  });

  it('shows vat exemption reason when present', async () => {
    renderWithInvoice({ vatExemptionReason: 'ייצוא שירותים §30(א)(5)' });

    expect(await screen.findByText('ייצוא שירותים §30(א)(5)')).toBeInTheDocument();
    expect(screen.getByText(/סיבת פטור ממע"מ/)).toBeInTheDocument();
  });
});
