import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InvoiceLineItems, type LineItemFormRow } from '../../components/InvoiceLineItems';
import { renderWithProviders } from '../utils/renderWithProviders';

// ── helpers ──

function makeRow(overrides: Partial<LineItemFormRow> = {}): LineItemFormRow {
  return {
    key: crypto.randomUUID(),
    description: '',
    catalogNumber: '',
    quantity: 1,
    unitPrice: 0,
    discountPercent: 0,
    vatRateBasisPoints: 1700,
    ...overrides,
  };
}

function renderLineItems(
  overrides: {
    items?: LineItemFormRow[];
    vatLocked?: boolean;
    defaultVatRate?: number;
  } = {}
) {
  const onChange = vi.fn();
  const items = overrides.items ?? [makeRow()];
  const result = renderWithProviders(
    <InvoiceLineItems
      items={items}
      onChange={onChange}
      vatLocked={overrides.vatLocked ?? false}
      defaultVatRate={overrides.defaultVatRate ?? 1700}
    />
  );
  return { ...result, onChange, items };
}

describe('InvoiceLineItems', () => {
  it('adds a new row when clicking "הוסף שורה"', async () => {
    const user = userEvent.setup();
    const { onChange } = renderLineItems();

    await user.click(screen.getByRole('button', { name: 'הוסף שורה' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const newItems = onChange.mock.calls[0]?.[0] as LineItemFormRow[];
    expect(newItems).toHaveLength(2);
  });

  it('removes a row when clicking the remove button', async () => {
    const user = userEvent.setup();
    const items = [makeRow({ description: 'Item A' }), makeRow({ description: 'Item B' })];
    const { onChange } = renderLineItems({ items });

    const firstRemoveButton = screen.getAllByRole('button', { name: 'הסר שורה' })[0];
    if (!firstRemoveButton) throw new Error('remove button not found');
    await user.click(firstRemoveButton);

    expect(onChange).toHaveBeenCalledTimes(1);
    const newItems = onChange.mock.calls[0]?.[0] as LineItemFormRow[];
    expect(newItems).toHaveLength(1);
    expect(newItems[0]?.description).toBe('Item B');
  });

  it('hides remove button when only one row exists', () => {
    renderLineItems({ items: [makeRow()] });

    const removeButtons = screen.queryAllByRole('button', { name: 'הסר שורה' });
    expect(removeButtons).toHaveLength(0);
  });

  it('disables VAT select when vatLocked is true', () => {
    renderLineItems({ vatLocked: true, items: [makeRow({ vatRateBasisPoints: 0 })] });

    // The VAT select renders as the last input element in each row
    const allInputs = document.querySelectorAll('input');
    const vatInput = allInputs[allInputs.length - 1];
    expect(vatInput).toBeDisabled();
  });

  it('calls onChange with updated description when typing', () => {
    const { onChange } = renderLineItems({ items: [makeRow({ description: 'original' })] });

    const descInput = screen.getByDisplayValue('original');
    fireEvent.change(descInput, { target: { value: 'updated' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedItems = onChange.mock.calls[0]?.[0] as LineItemFormRow[];
    expect(updatedItems[0]?.description).toBe('updated');
  });

  it('calls onChange with updated quantity when changing quantity field', () => {
    const { onChange } = renderLineItems({ items: [makeRow({ quantity: 2 })] });

    const allInputs = document.querySelectorAll('input');
    const quantityInput = allInputs[1]; // second input: quantity
    if (!quantityInput) throw new Error('quantity input not found');
    fireEvent.change(quantityInput, { target: { value: '5' } });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('calls onChange with updated unit price when changing price field', () => {
    const { onChange } = renderLineItems({ items: [makeRow({ unitPrice: 100 })] });

    const allInputs = document.querySelectorAll('input');
    const priceInput = allInputs[2]; // third input: unit price
    if (!priceInput) throw new Error('price input not found');
    fireEvent.change(priceInput, { target: { value: '200' } });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('shows labels only on first row when two rows exist', () => {
    const items = [makeRow({ description: 'Item A' }), makeRow({ description: 'Item B' })];
    renderLineItems({ items });

    // Label 'תיאור' (possibly with required asterisk) appears only once
    const allLabels = document.querySelectorAll('label');
    const descLabels = Array.from(allLabels).filter((l) => l.textContent?.includes('תיאור'));
    expect(descLabels).toHaveLength(1);

    // Both rows render their description inputs
    expect(screen.getAllByPlaceholderText('תיאור פריט')).toHaveLength(2);
  });

  it('shows computed line total for a row', () => {
    // 2 units × 100 price × 1.17 VAT = 23400 minor units
    const { container } = renderLineItems({
      items: [makeRow({ quantity: 2, unitPrice: 100, vatRateBasisPoints: 1700 })],
    });

    // The line total (234.00) is rendered; use container text to avoid RTL Unicode char issues
    expect(container.textContent).toContain('234');
  });

  it('adds row with defaultVatRate when clicking "הוסף שורה"', async () => {
    const user = userEvent.setup();
    const { onChange } = renderLineItems({ defaultVatRate: 0 });

    await user.click(screen.getByRole('button', { name: 'הוסף שורה' }));

    const newItems = onChange.mock.calls[0]?.[0] as LineItemFormRow[];
    expect(newItems[1]?.vatRateBasisPoints).toBe(0);
  });

  it('calls onChange with updated discount when changing discount field', () => {
    const { onChange } = renderLineItems({ items: [makeRow({ discountPercent: 0 })] });

    const allInputs = document.querySelectorAll('input');
    const discountInput = allInputs[3]; // fourth input: discount
    if (!discountInput) throw new Error('discount input not found');
    fireEvent.change(discountInput, { target: { value: '10' } });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('calls onChange with updated vatRateBasisPoints when selecting from VAT dropdown', () => {
    const { onChange } = renderLineItems({ items: [makeRow({ vatRateBasisPoints: 1700 })] });

    // The dropdown is pre-rendered in the DOM with display:none; find the hidden option and click it
    const exemptOption = screen.getByRole('option', { name: 'פטור', hidden: true });
    fireEvent.click(exemptOption);

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedItems = onChange.mock.calls[0]?.[0] as LineItemFormRow[];
    expect(updatedItems[0]?.vatRateBasisPoints).toBe(0);
  });
});
