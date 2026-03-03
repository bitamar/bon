import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { InvoiceEdit } from '../../pages/InvoiceEdit';
import { renderWithProviders } from '../utils/renderWithProviders';
import type { Invoice } from '@bon/types/invoices';

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
  fetchCustomer: vi.fn(),
}));
vi.mock('../../lib/notifications', () => ({
  showErrorNotification: vi.fn(),
  showSuccessNotification: vi.fn(),
  extractErrorMessage: vi.fn((_error: unknown, fallback: string) => fallback),
}));

import { useBusiness } from '../../contexts/BusinessContext';
import * as invoicesApi from '../../api/invoices';
import * as businessApi from '../../api/businesses';
import * as customersApi from '../../api/customers';
import { showErrorNotification, showSuccessNotification } from '../../lib/notifications';
import { mockActiveBusiness, mockNoBusiness } from '../utils/businessStubs';
import { makeDraftInvoice } from '../utils/invoiceStubs';

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

const mockCustomerResponse = {
  customer: {
    id: 'cust-1',
    businessId: 'biz-1',
    name: 'לקוח לדוגמה',
    taxId: '123456789',
    taxIdType: 'company_id' as const,
    isLicensedDealer: true,
    email: null,
    phone: null,
    streetAddress: null,
    city: null,
    postalCode: null,
    contactName: null,
    notes: null,
    isActive: true,
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
};

function setupDraftMocks(invoiceOverrides: Partial<Invoice> = {}) {
  vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(makeDraftInvoice(invoiceOverrides));
  vi.mocked(businessApi.fetchBusiness).mockResolvedValue(mockBusinessResponse);
}

async function renderEditWithNoDescriptionItem() {
  const noDesc = makeDraftInvoice();
  noDesc.items = [{ ...noDesc.items[0]!, description: '' }];
  setupDraftMocks();
  vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(noDesc);
  const user = userEvent.setup();
  renderEdit();
  await screen.findByRole('heading', { name: 'עריכת חשבונית' });
  return user;
}

async function expectMissingDescriptionValidation(buttonName: string) {
  const user = await renderEditWithNoDescriptionItem();
  await user.click(screen.getByRole('button', { name: buttonName }));
  await waitFor(() => {
    expect(showErrorNotification).toHaveBeenCalledWith(
      'יש שורות ללא תיאור — נא להוסיף תיאור לכל שורה עם מחיר'
    );
  });
  expect(invoicesApi.updateInvoiceDraft).not.toHaveBeenCalled();
}

function renderEdit() {
  return renderWithProviders(
    <Routes>
      <Route path="/businesses/:businessId/invoices/:invoiceId/edit" element={<InvoiceEdit />} />
      <Route path="/businesses/:businessId/invoices/:invoiceId" element={<div>detail-page</div>} />
      <Route path="/businesses/:businessId/dashboard" element={<div>home</div>} />
    </Routes>,
    { router: { initialEntries: ['/businesses/biz-1/invoices/inv-1/edit'] } }
  );
}

describe('InvoiceEdit page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockActiveBusiness(useBusiness);
    // Default to never-resolving so tests without explicit setup don't get
    // "Query data cannot be undefined" warnings from queries firing on mount.
    vi.mocked(invoicesApi.fetchInvoice).mockReturnValue(new Promise(() => {}));
    vi.mocked(businessApi.fetchBusiness).mockReturnValue(new Promise(() => {}));
    vi.mocked(customersApi.fetchCustomers).mockResolvedValue({ customers: [] });
    vi.mocked(customersApi.fetchCustomer).mockResolvedValue(mockCustomerResponse);
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

  it('redirects non-draft invoices to detail page', async () => {
    setupDraftMocks({ status: 'finalized' });
    renderEdit();

    expect(await screen.findByText('detail-page')).toBeInTheDocument();
  });

  it('calls updateInvoiceDraft on save with minor unit amounts', async () => {
    setupDraftMocks();
    vi.mocked(invoicesApi.updateInvoiceDraft).mockResolvedValue(makeDraftInvoice());
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
              unitPriceMinorUnits: 10000,
              position: 0,
            }),
          ]),
        })
      );
    });
  });

  it('saves successfully when line item has description with zero price', async () => {
    const zeroPrice = makeDraftInvoice();
    zeroPrice.items = [
      {
        ...zeroPrice.items[0]!,
        unitPriceMinorUnits: 0,
        lineTotalMinorUnits: 0,
        vatAmountMinorUnits: 0,
        lineTotalInclVatMinorUnits: 0,
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
    await expectMissingDescriptionValidation('שמור טיוטה');
  });

  it('shows error when clicking finalize with line item that has price but no description', async () => {
    await expectMissingDescriptionValidation('הפק חשבונית');
  });

  it('saves draft before starting finalization flow', async () => {
    const withCustomer = { customerId: 'cust-1' };
    setupDraftMocks(withCustomer);
    vi.mocked(invoicesApi.updateInvoiceDraft).mockResolvedValue(makeDraftInvoice(withCustomer));
    const user = userEvent.setup();
    renderEdit();

    await screen.findByRole('heading', { name: 'עריכת חשבונית' });

    await user.click(screen.getByRole('button', { name: 'הפק חשבונית' }));

    await waitFor(() => {
      expect(invoicesApi.updateInvoiceDraft).toHaveBeenCalled();
    });

    // After save succeeds, finalization flow starts (profile gate opens because mock business is incomplete)
    expect(await screen.findByText('נדרש להשלים פרטי עסק')).toBeInTheDocument();
  });

  it('disables finalize and delete buttons when role is user', async () => {
    vi.mocked(useBusiness).mockReturnValue({
      activeBusiness: {
        id: 'biz-1',
        name: 'Test Co',
        businessType: 'licensed_dealer' as const,
        role: 'user',
      },
      businesses: [],
      switchBusiness: vi.fn(),
      isLoading: false,
    });
    setupDraftMocks();
    renderEdit();

    await screen.findByRole('heading', { name: 'עריכת חשבונית' });

    expect(screen.getByRole('button', { name: 'מחק טיוטה' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'הפק חשבונית' })).toBeDisabled();
  });

  it('shows validation errors alert when finalizing with no customer selected', async () => {
    setupDraftMocks(); // draft has customerId: null by default
    vi.mocked(invoicesApi.updateInvoiceDraft).mockResolvedValue(makeDraftInvoice());
    const user = userEvent.setup();
    renderEdit();

    await screen.findByRole('heading', { name: 'עריכת חשבונית' });

    await user.click(screen.getByRole('button', { name: 'הפק חשבונית' }));

    await waitFor(() => {
      expect(invoicesApi.updateInvoiceDraft).toHaveBeenCalled();
    });

    expect(await screen.findByText('לא ניתן להפיק חשבונית')).toBeInTheDocument();
    expect(screen.getByText('יש לבחור לקוח לפני הפקת חשבונית')).toBeInTheDocument();
  });

  it('does not start finalization when save fails', async () => {
    setupDraftMocks({ customerId: 'cust-1' });
    vi.mocked(invoicesApi.updateInvoiceDraft).mockRejectedValue(new Error('save failed'));
    const user = userEvent.setup();
    renderEdit();

    await screen.findByRole('heading', { name: 'עריכת חשבונית' });

    await user.click(screen.getByRole('button', { name: 'הפק חשבונית' }));

    await waitFor(() => {
      expect(invoicesApi.updateInvoiceDraft).toHaveBeenCalled();
    });

    // Finalization flow should NOT start
    expect(screen.queryByText('נדרש להשלים פרטי עסק')).not.toBeInTheDocument();
  });

  it('shows error state when invoice fetch fails', async () => {
    vi.mocked(invoicesApi.fetchInvoice).mockRejectedValue(new Error('network error'));
    vi.mocked(businessApi.fetchBusiness).mockResolvedValue(mockBusinessResponse);
    renderEdit();

    expect(await screen.findByText('לא הצלחנו לטעון את החשבונית')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'נסה שוב' })).toBeInTheDocument();
  });

  it('locks VAT to 0 when document type is receipt', async () => {
    const receiptInvoice = makeDraftInvoice({ documentType: 'receipt' });
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

  // ── Save indicator ──

  it('shows save indicator as "saved" after initial load', async () => {
    setupDraftMocks();
    renderEdit();

    await screen.findByRole('heading', { name: 'עריכת חשבונית' });

    expect(screen.getByText('נשמר')).toBeInTheDocument();
  });

  it('changing document type via SegmentedControl updates form', async () => {
    setupDraftMocks();
    const user = userEvent.setup();
    renderEdit();

    await screen.findByRole('heading', { name: 'עריכת חשבונית' });

    // Click the "חשבונית מס קבלה" radio option to trigger onChange
    const radioOption = screen.getByRole('radio', { name: 'חשבונית מס קבלה' });
    await user.click(radioOption);

    // The SegmentedControl onChange should have fired; the description updates
    expect(screen.getByText('מסמך חיוב הכולל אישור תשלום')).toBeInTheDocument();
  });

  it('changing internal notes textarea updates form', async () => {
    setupDraftMocks();
    renderEdit();

    await screen.findByRole('heading', { name: 'עריכת חשבונית' });

    const internalNotesInput = screen.getByRole('textbox', { name: 'הערות פנימיות' });
    fireEvent.change(internalNotesInput, { target: { value: 'הערה פנימית' } });

    expect(internalNotesInput).toHaveValue('הערה פנימית');
  });

  it('shows success toast on manual save', async () => {
    setupDraftMocks();
    vi.mocked(invoicesApi.updateInvoiceDraft).mockResolvedValue(makeDraftInvoice());
    const user = userEvent.setup();
    renderEdit();

    await screen.findByRole('heading', { name: 'עריכת חשבונית' });

    await user.click(screen.getByRole('button', { name: 'שמור טיוטה' }));

    await waitFor(() => {
      expect(showSuccessNotification).toHaveBeenCalledWith('הטיוטה נשמרה בהצלחה');
    });
  });

  // ── Autosave ──

  describe('autosave', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('does not fire on initial load', async () => {
      setupDraftMocks();
      renderEdit();

      await vi.waitFor(() => {
        expect(screen.getByRole('heading', { name: 'עריכת חשבונית' })).toBeInTheDocument();
      });

      // Advance well past the debounce period
      await vi.advanceTimersByTimeAsync(5000);

      expect(invoicesApi.updateInvoiceDraft).not.toHaveBeenCalled();
    });

    it('fires after editing a field', async () => {
      setupDraftMocks();
      vi.mocked(invoicesApi.updateInvoiceDraft).mockResolvedValue(makeDraftInvoice());
      renderEdit();

      await vi.waitFor(() => {
        expect(screen.getByRole('heading', { name: 'עריכת חשבונית' })).toBeInTheDocument();
      });

      // Edit the notes textarea using fireEvent (avoids fake timer conflicts with userEvent)
      const notesInput = screen.getByDisplayValue('הערה לדוגמה');
      fireEvent.change(notesInput, { target: { value: 'הערה חדשה' } });

      // Advance past debounce period
      await vi.advanceTimersByTimeAsync(2500);

      await vi.waitFor(() => {
        expect(invoicesApi.updateInvoiceDraft).toHaveBeenCalled();
      });

      // Autosave should NOT show success toast
      expect(showSuccessNotification).not.toHaveBeenCalled();
    });
  });
});
