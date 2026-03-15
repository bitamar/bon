import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { InvoiceDetail } from '../../pages/InvoiceDetail';
import { renderWithProviders } from '../utils/renderWithProviders';
import type { Invoice, InvoiceStatus } from '@bon/types/invoices';

vi.mock('../../contexts/BusinessContext', () => ({ useBusiness: vi.fn() }));
vi.mock('../../api/invoices', () => ({
  fetchInvoice: vi.fn(),
  sendInvoiceByEmail: vi.fn(),
  recordPayment: vi.fn(),
  deletePayment: vi.fn(),
  createCreditNote: vi.fn(),
  downloadInvoicePdf: vi.fn(),
}));

import { useBusiness } from '../../contexts/BusinessContext';
import * as invoicesApi from '../../api/invoices';
import { mockActiveBusiness, mockNoBusiness } from '../utils/businessStubs';
import { makeFinalizedInvoice, makeCreditNoteInvoice } from '../utils/invoiceStubs';

function makeInvoiceWithPayments() {
  return {
    ...makeFinalizedInvoice(),
    payments: [
      {
        id: 'pay-1',
        invoiceId: 'inv-1',
        amountMinorUnits: 5000,
        paidAt: '2026-03-01',
        method: 'transfer' as const,
        reference: 'REF-001',
        notes: null,
        recordedByUserId: 'user-1',
        createdAt: '2026-03-01T00:00:00.000Z',
      },
    ],
    remainingBalanceMinorUnits: 6700,
  };
}

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

async function openSendModal(user: UserEvent) {
  await user.click(await screen.findByRole('button', { name: 'שלח במייל' }));
  await screen.findByText('שליחת חשבונית במייל');
}

async function fillSendEmail(user: UserEvent, email: string) {
  const emailInput = await screen.findByTestId('send-email-input');
  await user.clear(emailInput);
  await user.type(emailInput, email);
}

async function submitSendModal(user: UserEvent) {
  const confirmButton = await screen.findByRole('button', { name: /^שלח$/ });
  await user.click(confirmButton);
}

async function openPaymentModal(user: UserEvent) {
  await user.click(await screen.findByRole('button', { name: 'סמן כשולם' }));
  await screen.findByText('רישום תשלום');
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

    // Action buttons — all enabled for finalized invoices
    expect(screen.getByRole('button', { name: 'הורד PDF' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'שלח במייל' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'סמן כשולם' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'הפק חשבונית זיכוי' })).toBeEnabled();
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

  it('shows allocation number when approved', async () => {
    renderWithInvoice({ allocationStatus: 'approved', allocationNumber: 'ALLOC-12345' });

    expect(await screen.findByText('ALLOC-12345')).toBeInTheDocument();
    expect(screen.getByText('מספר הקצאה:')).toBeInTheDocument();
    expect(screen.getByTestId('allocation-approved')).toBeInTheDocument();
  });

  it('shows pending status when allocation is pending', async () => {
    renderWithInvoice({ allocationStatus: 'pending' });

    expect(await screen.findByText('ממתין לאישור SHAAM')).toBeInTheDocument();
    expect(screen.getByTestId('allocation-pending')).toBeInTheDocument();
  });

  it('shows rejected status with error message', async () => {
    renderWithInvoice({
      allocationStatus: 'rejected',
      allocationError: 'E001: מספר מע״מ לא תקין',
    });

    expect(await screen.findByText('הקצאת SHAAM נדחתה')).toBeInTheDocument();
    expect(screen.getByText('E001: מספר מע״מ לא תקין')).toBeInTheDocument();
    expect(screen.getByTestId('allocation-rejected')).toBeInTheDocument();
  });

  it('shows emergency allocation number', async () => {
    renderWithInvoice({ allocationStatus: 'emergency', allocationNumber: 'EMR-99999' });

    expect(await screen.findByText('EMR-99999')).toBeInTheDocument();
    expect(screen.getByText('מספר הקצאת חירום:')).toBeInTheDocument();
    expect(screen.getByTestId('allocation-emergency')).toBeInTheDocument();
  });

  it('does not show allocation section when status is null', async () => {
    renderWithInvoice({ allocationStatus: null, allocationNumber: null });

    await screen.findByText('INV-0001');
    expect(screen.queryByTestId('allocation-approved')).not.toBeInTheDocument();
    expect(screen.queryByTestId('allocation-pending')).not.toBeInTheDocument();
    expect(screen.queryByTestId('allocation-rejected')).not.toBeInTheDocument();
    expect(screen.queryByTestId('allocation-emergency')).not.toBeInTheDocument();
  });

  it('shows vat exemption reason when present', async () => {
    renderWithInvoice({ vatExemptionReason: 'ייצוא שירותים §30(א)(5)' });

    expect(await screen.findByText('ייצוא שירותים §30(א)(5)')).toBeInTheDocument();
    expect(screen.getByText(/סיבת פטור ממע"מ/)).toBeInTheDocument();
  });

  it('shows remaining balance when > 0', async () => {
    vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(makeInvoiceWithPayments());
    renderDetail();

    expect(await screen.findByTestId('remaining-balance')).toBeInTheDocument();
    expect(screen.getByText('יתרה לתשלום:')).toBeInTheDocument();
  });

  it('shows due date and timeline dates', async () => {
    renderWithInvoice();

    await screen.findByText('INV-0001');
    expect(screen.getByText(/תאריך תשלום:/)).toBeInTheDocument();
    expect(screen.getByText(/נוצרה:/)).toBeInTheDocument();
    expect(screen.getAllByText(/הופקה:/).length).toBeGreaterThan(0);
  });
});

describe('InvoiceDetail PDF download', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockActiveBusiness(useBusiness);
  });

  it('calls downloadInvoicePdf when PDF button is clicked', async () => {
    vi.mocked(invoicesApi.downloadInvoicePdf).mockResolvedValue(undefined);
    renderWithInvoice();
    const user = userEvent.setup();

    const pdfButton = await screen.findByRole('button', { name: 'הורד PDF' });
    await user.click(pdfButton);

    await waitFor(() => {
      expect(invoicesApi.downloadInvoicePdf).toHaveBeenCalledWith('biz-1', 'inv-1');
    });
  });
});

describe('InvoiceDetail send email', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockActiveBusiness(useBusiness);
  });

  it('opens send modal with prefilled email on click', async () => {
    vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(
      makeFinalizedInvoice({ customerEmail: 'test@example.com' })
    );
    renderDetail();
    const user = userEvent.setup();

    await openSendModal(user);

    const emailInput = await screen.findByTestId('send-email-input');
    expect(emailInput).toHaveValue('test@example.com');
  });

  it('disables send button for non-sendable statuses', async () => {
    vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(makeFinalizedInvoice({ status: 'paid' }));
    renderDetail();

    const sendButton = await screen.findByRole('button', { name: 'שלח במייל' });
    expect(sendButton).toBeDisabled();
  });

  it('calls sendInvoiceByEmail on submit', async () => {
    vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(
      makeFinalizedInvoice({ customerEmail: 'test@example.com' })
    );
    vi.mocked(invoicesApi.sendInvoiceByEmail).mockResolvedValue({
      ok: true,
      sentAt: '2026-03-03T12:00:00.000Z',
    });
    renderDetail();
    const user = userEvent.setup();

    await openSendModal(user);
    await submitSendModal(user);

    await waitFor(() => {
      expect(invoicesApi.sendInvoiceByEmail).toHaveBeenCalledWith('biz-1', 'inv-1', {
        recipientEmail: 'test@example.com',
      });
    });
  });

  it('allows editing the recipient email before sending', async () => {
    vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(
      makeFinalizedInvoice({ customerEmail: 'original@example.com' })
    );
    vi.mocked(invoicesApi.sendInvoiceByEmail).mockResolvedValue({
      ok: true,
      sentAt: '2026-03-03T12:00:00.000Z',
    });
    renderDetail();
    const user = userEvent.setup();

    await openSendModal(user);
    await fillSendEmail(user, 'new@example.com');
    await submitSendModal(user);

    await waitFor(() => {
      expect(invoicesApi.sendInvoiceByEmail).toHaveBeenCalledWith('biz-1', 'inv-1', {
        recipientEmail: 'new@example.com',
      });
    });
  });

  it('disables confirm button when email is empty', async () => {
    vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(
      makeFinalizedInvoice({ customerEmail: null })
    );
    renderDetail();
    const user = userEvent.setup();

    await openSendModal(user);

    const confirmButton = await screen.findByRole('button', { name: /^שלח$/ });
    expect(confirmButton).toBeDisabled();
  });
});

describe('InvoiceDetail payments', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockActiveBusiness(useBusiness);
  });

  it('opens payment modal on button click', async () => {
    vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(makeFinalizedInvoice());
    renderDetail();
    const user = userEvent.setup();

    await openPaymentModal(user);

    expect(screen.getByTestId('payment-amount-input')).toBeInTheDocument();
    expect(screen.getByTestId('payment-method-input')).toBeInTheDocument();
    expect(screen.getByTestId('payment-submit')).toBeInTheDocument();
  });

  it('calls recordPayment on successful submission', async () => {
    vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(makeFinalizedInvoice());
    vi.mocked(invoicesApi.recordPayment).mockResolvedValue(
      makeFinalizedInvoice({ status: 'paid' })
    );
    renderDetail();
    const user = userEvent.setup();

    await openPaymentModal(user);

    // Select payment method
    await user.click(screen.getByTestId('payment-method-input'));
    await user.click(await screen.findByText('מזומן'));

    // Submit
    await user.click(screen.getByTestId('payment-submit'));

    await waitFor(() => {
      expect(invoicesApi.recordPayment).toHaveBeenCalled();
    });
  });

  it('disables payment button for non-payable statuses', async () => {
    vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(makeFinalizedInvoice({ status: 'paid' }));
    renderDetail();

    const payButton = await screen.findByRole('button', { name: 'סמן כשולם' });
    expect(payButton).toBeDisabled();
  });

  it('shows empty payment history', async () => {
    vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(makeFinalizedInvoice());
    renderDetail();

    expect(await screen.findByTestId('no-payments')).toBeInTheDocument();
    expect(screen.getByText('לא נרשמו תשלומים')).toBeInTheDocument();
  });

  it('shows payment rows when payments exist', async () => {
    vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(makeInvoiceWithPayments());
    renderDetail();

    const rows = await screen.findAllByTestId('payment-row');
    expect(rows).toHaveLength(1);
    expect(screen.getByText('REF-001')).toBeInTheDocument();
  });

  it('deletes a payment after confirmation', async () => {
    vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(makeInvoiceWithPayments());
    vi.mocked(invoicesApi.deletePayment).mockResolvedValue(makeFinalizedInvoice());
    renderDetail();
    const user = userEvent.setup();

    const deleteBtn = await screen.findByTestId('delete-payment-pay-1');
    await user.click(deleteBtn);

    expect(await screen.findByText('מחיקת תשלום')).toBeInTheDocument();
    await user.click(screen.getByTestId('confirm-delete-payment'));

    await waitFor(() => {
      expect(invoicesApi.deletePayment).toHaveBeenCalledWith('biz-1', 'inv-1', 'pay-1');
    });
  });
});

describe('InvoiceDetail credit notes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockActiveBusiness(useBusiness);
  });

  it('opens credit note modal and shows pre-filled items', async () => {
    renderWithInvoice();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'הפק חשבונית זיכוי' }));

    expect(await screen.findByText('הפקת חשבונית זיכוי')).toBeInTheDocument();
    expect(screen.getAllByTestId('credit-note-item-row')).toHaveLength(1);
    expect(screen.getByTestId('credit-note-submit')).toBeEnabled();
  });

  it('calls createCreditNote on submission', async () => {
    vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(makeFinalizedInvoice());
    vi.mocked(invoicesApi.createCreditNote).mockResolvedValue(makeCreditNoteInvoice());
    renderDetail();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'הפק חשבונית זיכוי' }));
    await screen.findByText('הפקת חשבונית זיכוי');
    await user.click(screen.getByTestId('credit-note-submit'));

    await waitFor(() => {
      expect(invoicesApi.createCreditNote).toHaveBeenCalledWith('biz-1', 'inv-1', {
        items: expect.arrayContaining([expect.objectContaining({ description: 'שירות ייעוץ' })]),
      });
    });
  });

  it('disables submit when all items removed', async () => {
    renderWithInvoice();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'הפק חשבונית זיכוי' }));
    await screen.findByText('הפקת חשבונית זיכוי');

    // Remove the item
    await user.click(screen.getByTestId('credit-note-remove-0'));

    expect(screen.getByTestId('credit-note-submit')).toBeDisabled();
    expect(screen.getByTestId('credit-note-empty')).toBeInTheDocument();
  });

  it('does not show credit note button for credit_note documents', async () => {
    vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(makeCreditNoteInvoice());
    renderDetail();

    await screen.findByText('CN-0001');
    expect(screen.queryByRole('button', { name: 'הפק חשבונית זיכוי' })).not.toBeInTheDocument();
  });

  it('shows source invoice link on credit note detail', async () => {
    vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(makeCreditNoteInvoice());
    renderDetail();

    expect(await screen.findByTestId('credit-note-source-link')).toBeInTheDocument();
    expect(screen.getByText('INV-0001')).toBeInTheDocument();
  });

  it('shows credit note link on credited invoice detail', async () => {
    const stub = makeFinalizedInvoice({ status: 'credited' });
    stub.creditNotes = [{ id: 'cn-1', documentNumber: 'CN-0001' }];
    vi.mocked(invoicesApi.fetchInvoice).mockResolvedValue(stub);
    renderDetail();

    expect(await screen.findByTestId('credited-invoice-link')).toBeInTheDocument();
  });
});
