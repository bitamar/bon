import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { InvoiceDetail } from '../../pages/InvoiceDetail';
import { renderWithProviders } from '../utils/renderWithProviders';
import type { InvoiceResponse, InvoiceStatus } from '@bon/types/invoices';

vi.mock('../../contexts/BusinessContext', () => ({ useBusiness: vi.fn() }));
vi.mock('../../api/invoices', () => ({
  fetchInvoice: vi.fn(),
}));

import { useBusiness } from '../../contexts/BusinessContext';
import * as invoicesApi from '../../api/invoices';
import { mockActiveBusiness, mockNoBusiness } from '../utils/businessStubs';

// ── helpers ──

function makeFinalizedInvoice(overrides: Record<string, unknown> = {}): InvoiceResponse {
  return {
    invoice: {
      id: 'inv-1',
      businessId: 'biz-1',
      customerId: 'cust-1',
      customerName: 'לקוח לדוגמה',
      customerTaxId: '123456782',
      customerAddress: 'רחוב הרצל 1, תל אביב',
      customerEmail: 'test@example.com',
      documentType: 'tax_invoice' as const,
      status: 'finalized' as const,
      isOverdue: false,
      sequenceGroup: 'tax_document',
      sequenceNumber: 1,
      documentNumber: 'INV-0001',
      creditedInvoiceId: null,
      invoiceDate: '2026-02-20',
      issuedAt: '2026-02-20T10:30:00.000Z',
      dueDate: '2026-03-20',
      notes: 'הערה לדוגמה',
      internalNotes: null,
      currency: 'ILS',
      vatExemptionReason: null,
      subtotalMinorUnits: 10000,
      discountMinorUnits: 0,
      totalExclVatMinorUnits: 10000,
      vatMinorUnits: 1700,
      totalInclVatMinorUnits: 11700,
      allocationStatus: null,
      allocationNumber: null,
      allocationError: null,
      sentAt: null,
      paidAt: null,
      createdAt: '2026-02-20T00:00:00.000Z',
      updatedAt: '2026-02-20T10:30:00.000Z',
      ...overrides,
    },
    items: [
      {
        id: 'item-1',
        invoiceId: 'inv-1',
        position: 0,
        description: 'שירות ייעוץ',
        catalogNumber: null,
        quantity: 1,
        unitPriceMinorUnits: 10000,
        discountPercent: 0,
        vatRateBasisPoints: 1700,
        lineTotalMinorUnits: 10000,
        vatAmountMinorUnits: 1700,
        lineTotalInclVatMinorUnits: 11700,
      },
    ],
  };
}

function renderDetail() {
  return renderWithProviders(
    <Routes>
      <Route path="/business/invoices/:invoiceId" element={<InvoiceDetail />} />
      <Route path="/business/invoices/:invoiceId/edit" element={<div>edit-page</div>} />
    </Routes>,
    { router: { initialEntries: ['/business/invoices/inv-1'] } }
  );
}

function renderWithInvoice(overrides: Record<string, unknown> = {}) {
  vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(makeFinalizedInvoice(overrides));
  return renderDetail();
}

describe('InvoiceDetail page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockActiveBusiness(useBusiness);
  });

  it('shows error when no active business', () => {
    mockNoBusiness(useBusiness);
    renderDetail();
    expect(screen.getByText('לא נבחר עסק')).toBeInTheDocument();
  });

  it('shows loading skeleton', () => {
    vi.mocked(invoicesApi.fetchInvoice).mockReturnValue(new Promise(() => {}));
    const { container } = renderDetail();
    // Mantine Skeleton renders with the mantine-Skeleton-root class
    expect(container.querySelector('.mantine-Skeleton-root')).toBeInTheDocument();
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
  });
});
