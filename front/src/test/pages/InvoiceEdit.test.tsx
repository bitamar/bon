import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { InvoiceEdit } from '../../pages/InvoiceEdit';
import { renderWithProviders } from '../utils/renderWithProviders';
import type { InvoiceResponse } from '@bon/types/invoices';

vi.mock('../../contexts/BusinessContext', () => ({ useBusiness: vi.fn() }));
vi.mock('../../api/invoices', () => ({
  fetchInvoice: vi.fn(),
  updateInvoiceDraft: vi.fn(),
  deleteInvoiceDraft: vi.fn(),
}));
vi.mock('../../api/businesses', () => ({
  fetchBusiness: vi.fn(),
}));
vi.mock('../../api/customers', () => ({
  fetchCustomers: vi.fn().mockResolvedValue({ customers: [] }),
}));
vi.mock('../../lib/notifications', () => ({
  showErrorNotification: vi.fn(),
  showSuccessNotification: vi.fn(),
  extractErrorMessage: vi.fn((_error: unknown, fallback: string) => fallback),
}));

import { useBusiness } from '../../contexts/BusinessContext';
import * as invoicesApi from '../../api/invoices';
import * as businessApi from '../../api/businesses';
import { showErrorNotification } from '../../lib/notifications';
import { mockActiveBusiness, mockNoBusiness } from '../utils/businessStubs';

// ── helpers ──

const mockBusinessResponse = {
  business: {
    id: 'biz-1',
    name: 'Test Co',
    businessType: 'licensed_dealer' as const,
    registrationNumber: '123456782',
    vatNumber: null,
    streetAddress: null,
    city: null,
    postalCode: null,
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
  },
  role: 'owner' as const,
};

function makeMockInvoice(overrides: Record<string, unknown> = {}): InvoiceResponse {
  return {
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
      fullNumber: null,
      creditedInvoiceId: null,
      invoiceDate: '2026-02-23',
      issuedAt: null,
      dueDate: null,
      notes: 'הערה לדוגמה',
      internalNotes: null,
      currency: 'ILS',
      vatExemptionReason: null,
      subtotalAgora: 10000,
      discountAgora: 0,
      totalExclVatAgora: 10000,
      vatAgora: 1700,
      totalInclVatAgora: 11700,
      allocationStatus: null,
      allocationNumber: null,
      allocationError: null,
      sentAt: null,
      paidAt: null,
      createdAt: '2026-02-23T00:00:00.000Z',
      updatedAt: '2026-02-23T00:00:00.000Z',
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
        unitPriceAgora: 10000,
        discountPercent: 0,
        vatRateBasisPoints: 1700,
        lineTotalAgora: 10000,
        vatAmountAgora: 1700,
        lineTotalInclVatAgora: 11700,
      },
    ],
  };
}

function setupDraftMocks(invoiceOverrides: Record<string, unknown> = {}) {
  vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(makeMockInvoice(invoiceOverrides));
  vi.mocked(businessApi.fetchBusiness).mockResolvedValue(mockBusinessResponse);
}

function renderEdit() {
  return renderWithProviders(
    <Routes>
      <Route path="/business/invoices/:invoiceId/edit" element={<InvoiceEdit />} />
      <Route path="/" element={<div>home</div>} />
    </Routes>,
    { router: { initialEntries: ['/business/invoices/inv-1/edit'] } }
  );
}

describe('InvoiceEdit page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockActiveBusiness(useBusiness);
  });

  it('shows error when no active business', () => {
    mockNoBusiness(useBusiness);
    renderEdit();
    expect(screen.getByText('לא נבחר עסק')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    vi.mocked(invoicesApi.fetchInvoice).mockReturnValue(new Promise(() => {}));
    vi.mocked(businessApi.fetchBusiness).mockReturnValue(new Promise(() => {}));
    renderEdit();
    expect(screen.getByText('טוען חשבונית...')).toBeInTheDocument();
  });

  it('loads draft and displays form fields', async () => {
    setupDraftMocks();
    renderEdit();

    expect(await screen.findByRole('heading', { name: 'עריכת חשבונית' })).toBeInTheDocument();
    expect(screen.getByText('טיוטה')).toBeInTheDocument();
    expect(screen.getByText('מספר יוקצה בהפקה')).toBeInTheDocument();

    // Check document type SegmentedControl has tax_invoice active
    expect(screen.getByText('חשבונית מס')).toBeInTheDocument();

    // Check notes
    expect(screen.getByDisplayValue('הערה לדוגמה')).toBeInTheDocument();

    // Check line item
    expect(screen.getByDisplayValue('שירות ייעוץ')).toBeInTheDocument();
  });

  it('shows alert for non-draft invoices', async () => {
    setupDraftMocks({ status: 'finalized' });
    renderEdit();

    expect(await screen.findByText('חשבונית זו כבר הופקה ואינה ניתנת לעריכה')).toBeInTheDocument();
  });

  it('calls updateInvoiceDraft on save with agora amounts', async () => {
    setupDraftMocks();
    vi.mocked(invoicesApi.updateInvoiceDraft).mockResolvedValue(makeMockInvoice());
    const user = userEvent.setup();
    renderEdit();

    await screen.findByRole('heading', { name: 'עריכת חשבונית' });

    await user.click(screen.getByRole('button', { name: 'שמור טיוטה' }));

    await waitFor(() => {
      expect(invoicesApi.updateInvoiceDraft).toHaveBeenCalledWith(
        'biz-1',
        'inv-1',
        expect.objectContaining({
          documentType: 'tax_invoice',
          invoiceDate: '2026-02-23',
          items: expect.arrayContaining([
            expect.objectContaining({
              description: 'שירות ייעוץ',
              unitPriceAgora: 10000,
              position: 0,
            }),
          ]),
        })
      );
    });
  });

  it('saves successfully when line item has description with zero price', async () => {
    const zeroPrice = makeMockInvoice({});
    zeroPrice.items = [
      {
        ...zeroPrice.items[0]!,
        unitPriceAgora: 0,
        lineTotalAgora: 0,
        vatAmountAgora: 0,
        lineTotalInclVatAgora: 0,
      },
    ];
    setupDraftMocks();
    vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(zeroPrice);
    vi.mocked(invoicesApi.updateInvoiceDraft).mockResolvedValue(zeroPrice);
    const user = userEvent.setup();
    renderEdit();

    await screen.findByRole('heading', { name: 'עריכת חשבונית' });
    await user.click(screen.getByRole('button', { name: 'שמור טיוטה' }));

    await waitFor(() => {
      expect(invoicesApi.updateInvoiceDraft).toHaveBeenCalled();
    });
    expect(showErrorNotification).not.toHaveBeenCalled();
  });

  it('shows error when line item has price but no description', async () => {
    const noDesc = makeMockInvoice({});
    noDesc.items = [{ ...noDesc.items[0]!, description: '' }];
    setupDraftMocks();
    vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(noDesc);
    const user = userEvent.setup();
    renderEdit();

    await screen.findByRole('heading', { name: 'עריכת חשבונית' });
    await user.click(screen.getByRole('button', { name: 'שמור טיוטה' }));

    await waitFor(() => {
      expect(showErrorNotification).toHaveBeenCalledWith(
        'יש שורות ללא תיאור — נא להוסיף תיאור לכל שורה עם מחיר'
      );
    });
    expect(invoicesApi.updateInvoiceDraft).not.toHaveBeenCalled();
  });

  it('shows error state when invoice fetch fails', async () => {
    vi.mocked(invoicesApi.fetchInvoice).mockRejectedValue(new Error('network error'));
    vi.mocked(businessApi.fetchBusiness).mockResolvedValue(mockBusinessResponse);
    renderEdit();

    expect(await screen.findByText('לא הצלחנו לטעון את החשבונית')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'נסה שוב' })).toBeInTheDocument();
  });

  it('locks VAT to 0 when document type is receipt', async () => {
    const receiptInvoice = makeMockInvoice({ documentType: 'receipt' });
    receiptInvoice.items = [{ ...receiptInvoice.items[0]!, vatRateBasisPoints: 1700 }];
    vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(receiptInvoice);
    vi.mocked(businessApi.fetchBusiness).mockResolvedValue(mockBusinessResponse);
    vi.mocked(invoicesApi.updateInvoiceDraft).mockResolvedValue(receiptInvoice);
    const user = userEvent.setup();
    renderEdit();

    await screen.findByRole('heading', { name: 'עריכת חשבונית' });

    // Save and verify all items have vatRateBasisPoints = 0
    await user.click(screen.getByRole('button', { name: 'שמור טיוטה' }));

    await waitFor(() => {
      expect(invoicesApi.updateInvoiceDraft).toHaveBeenCalledWith(
        'biz-1',
        'inv-1',
        expect.objectContaining({
          items: expect.arrayContaining([expect.objectContaining({ vatRateBasisPoints: 0 })]),
        })
      );
    });
  });

  it('deletes draft and navigates home on confirm', async () => {
    setupDraftMocks();
    vi.mocked(invoicesApi.deleteInvoiceDraft).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderEdit();

    await screen.findByRole('heading', { name: 'עריכת חשבונית' });

    await user.click(screen.getByRole('button', { name: 'מחק טיוטה' }));

    expect(
      await screen.findByText('האם למחוק את הטיוטה? פעולה זו אינה ניתנת לביטול.')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'מחק' }));

    await waitFor(() => {
      expect(invoicesApi.deleteInvoiceDraft).toHaveBeenCalledWith('biz-1', 'inv-1');
    });
  });
});
