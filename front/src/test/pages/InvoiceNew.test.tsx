import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { InvoiceNew } from '../../pages/InvoiceNew';
import { renderWithProviders } from '../utils/renderWithProviders';

vi.mock('../../contexts/BusinessContext', () => ({ useBusiness: vi.fn() }));
vi.mock('../../api/invoices', () => ({
  createInvoiceDraft: vi.fn(),
}));

import { useBusiness } from '../../contexts/BusinessContext';
import * as invoicesApi from '../../api/invoices';
import { mockActiveBusiness, mockNoBusiness } from '../utils/businessStubs';

// ── helpers ──

const mockInvoiceResponse = {
  invoice: {
    id: 'inv-1',
    businessId: 'biz-1',
    customerId: null,
    customerName: null,
    customerTaxId: null,
    customerAddress: null,
    customerEmail: null,
    documentType: 'tax_invoice' as const,
    status: 'draft' as const,
    isOverdue: false,
    sequenceGroup: null,
    sequenceNumber: null,
    documentNumber: null,
    creditedInvoiceId: null,
    invoiceDate: '2026-02-23',
    issuedAt: null,
    dueDate: null,
    notes: null,
    internalNotes: null,
    currency: 'ILS',
    vatExemptionReason: null,
    subtotalMinorUnits: 0,
    discountMinorUnits: 0,
    totalExclVatMinorUnits: 0,
    vatMinorUnits: 0,
    totalInclVatMinorUnits: 0,
    allocationStatus: null,
    allocationNumber: null,
    allocationError: null,
    sentAt: null,
    paidAt: null,
    createdAt: '2026-02-23T00:00:00.000Z',
    updatedAt: '2026-02-23T00:00:00.000Z',
  },
  items: [],
};

function renderNew() {
  return renderWithProviders(
    <Routes>
      <Route path="/businesses/:businessId/invoices/new" element={<InvoiceNew />} />
      <Route
        path="/businesses/:businessId/invoices/:invoiceId/edit"
        element={<div>edit page</div>}
      />
    </Routes>,
    { router: { initialEntries: ['/businesses/biz-1/invoices/new'] } }
  );
}

describe('InvoiceNew page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockActiveBusiness(useBusiness);
  });

  it('shows error when no active business', () => {
    mockNoBusiness(useBusiness);
    renderNew();
    expect(screen.getByText('לא נבחר עסק')).toBeInTheDocument();
  });

  it('creates draft and navigates to edit page on success', async () => {
    vi.mocked(invoicesApi.createInvoiceDraft).mockResolvedValue(mockInvoiceResponse);
    renderNew();

    await waitFor(() => {
      expect(invoicesApi.createInvoiceDraft).toHaveBeenCalledWith('biz-1', {
        documentType: 'tax_invoice',
      });
    });

    expect(await screen.findByText('edit page')).toBeInTheDocument();
  });

  it('shows error with retry button on failure', async () => {
    vi.mocked(invoicesApi.createInvoiceDraft).mockRejectedValue(new Error('fail'));
    renderNew();

    expect(await screen.findByText('לא הצלחנו ליצור טיוטה')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'נסה שוב' })).toBeInTheDocument();

    vi.mocked(invoicesApi.createInvoiceDraft).mockResolvedValue(mockInvoiceResponse);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'נסה שוב' }));

    await waitFor(() => {
      expect(invoicesApi.createInvoiceDraft).toHaveBeenCalledTimes(2);
    });
  });
});
