import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { InvoiceTotals } from '../../components/InvoiceTotals';
import { renderWithProviders } from '../utils/renderWithProviders';
import type { LineItemFormRow } from '../../components/InvoiceLineItems';

function makeRow(overrides: Partial<LineItemFormRow> = {}): LineItemFormRow {
  return {
    key: crypto.randomUUID(),
    description: 'Item',
    catalogNumber: '',
    quantity: 1,
    unitPriceShekel: 100,
    discountPercent: 0,
    vatRateBasisPoints: 1700,
    ...overrides,
  };
}

describe('InvoiceTotals', () => {
  it('renders totals with standard VAT label', () => {
    renderWithProviders(<InvoiceTotals items={[makeRow()]} />);
    expect(screen.getByText('מע״מ 17%')).toBeInTheDocument();
    expect(screen.getByText('סה״כ')).toBeInTheDocument();
  });

  it('shows discount row when discount is greater than zero', () => {
    renderWithProviders(<InvoiceTotals items={[makeRow({ discountPercent: 10 })]} />);
    expect(screen.getByText('הנחה')).toBeInTheDocument();
  });

  it('shows generic "מע״מ" label when items have mixed VAT rates', () => {
    renderWithProviders(
      <InvoiceTotals
        items={[makeRow({ vatRateBasisPoints: 1700 }), makeRow({ vatRateBasisPoints: 0 })]}
      />
    );
    expect(screen.getByText('מע״מ')).toBeInTheDocument();
  });

  it('shows "פטור ממע״מ" when all items have vatRateBasisPoints of 0', () => {
    renderWithProviders(<InvoiceTotals items={[makeRow({ vatRateBasisPoints: 0 })]} />);
    expect(screen.getByText('פטור ממע״מ')).toBeInTheDocument();
  });
});
