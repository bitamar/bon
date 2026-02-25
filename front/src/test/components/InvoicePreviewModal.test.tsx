import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InvoicePreviewModal } from '../../components/InvoicePreviewModal';
import { renderWithProviders } from '../utils/renderWithProviders';
import type { LineItemFormRow } from '../../components/InvoiceLineItems';

// ── helpers ──

let _itemKeyCounter = 0;

function makeItem(overrides: Partial<LineItemFormRow> = {}): LineItemFormRow {
  _itemKeyCounter += 1;
  return {
    key: `item-${_itemKeyCounter}`,
    description: 'שירות ייעוץ',
    catalogNumber: '',
    quantity: 1,
    unitPrice: 100,
    discountPercent: 0,
    vatRateBasisPoints: 1700,
    ...overrides,
  };
}

const defaultProps: {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirming: boolean;
  documentType: 'tax_invoice';
  invoiceDate: string | null;
  customer: { name: string; taxId: string; city: string } | null;
  items: LineItemFormRow[];
  notes: string;
  vatExemptionReason: string | null;
} = {
  opened: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  confirming: false,
  documentType: 'tax_invoice',
  invoiceDate: '2026-02-20',
  customer: { name: 'לקוח לדוגמה', taxId: '123456782', city: 'תל אביב' },
  items: [makeItem()],
  notes: '',
  vatExemptionReason: null,
};

function renderPreview(overrides: Partial<typeof defaultProps> = {}) {
  return renderWithProviders(<InvoicePreviewModal {...defaultProps} {...overrides} />);
}

describe('InvoicePreviewModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    _itemKeyCounter = 0;
  });

  it('renders document type, customer info, and line items', () => {
    renderPreview();

    // Document type
    expect(screen.getByText('חשבונית מס')).toBeInTheDocument();

    // Invoice date
    expect(screen.getByText(/2026-02-20/)).toBeInTheDocument();

    // Customer info
    expect(screen.getByText('לקוח לדוגמה')).toBeInTheDocument();
    expect(screen.getByText('123456782')).toBeInTheDocument();
    expect(screen.getByText('תל אביב')).toBeInTheDocument();

    // Line item description
    expect(screen.getByText('שירות ייעוץ')).toBeInTheDocument();

    // Total amount (100 ILS + 17% VAT = 117 ILS)
    expect(screen.getByText('סה״כ לתשלום')).toBeInTheDocument();
  });

  it('shows VAT exemption reason when provided', () => {
    renderPreview({ vatExemptionReason: 'ייצוא שירותים §30(א)(5)' });

    expect(screen.getByText('ייצוא שירותים §30(א)(5)')).toBeInTheDocument();
    expect(screen.getByText(/סיבת פטור ממע"מ/)).toBeInTheDocument();
  });

  it('shows notes when provided', () => {
    renderPreview({ notes: 'הערה לדוגמה' });

    expect(screen.getByText('הערה לדוגמה')).toBeInTheDocument();
  });

  it('shows VAT exempt label when all items have 0 VAT', () => {
    renderPreview({ items: [makeItem({ vatRateBasisPoints: 0 })] });

    expect(screen.getByText('פטור ממע״מ')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    renderPreview({ onConfirm });

    await user.click(screen.getByRole('button', { name: 'אשר והפק' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when back button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPreview({ onClose });

    await user.click(screen.getByRole('button', { name: 'חזרה לעריכה' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables back button and shows loading on confirm button when confirming', () => {
    renderPreview({ confirming: true });

    expect(screen.getByRole('button', { name: 'חזרה לעריכה' })).toBeDisabled();
    const confirmBtn = screen.getByRole('button', { name: 'אשר והפק' });
    expect(confirmBtn).toHaveAttribute('data-loading', 'true');
  });

  it('shows discount row in totals when items have discounts', () => {
    renderPreview({ items: [makeItem({ discountPercent: 10 })] });

    expect(screen.getByText('הנחה')).toBeInTheDocument();
  });
});
