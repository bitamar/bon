import { describe, it, expect, vi, beforeAll } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InvoiceLineItems, type LineItemFormRow } from '../../components/InvoiceLineItems';
import { renderWithProviders } from '../utils/renderWithProviders';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

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

  it('changing description calls onChange with updated item', () => {
    const { onChange } = renderLineItems({ items: [makeRow({ description: '' })] });

    const descriptionInput = screen.getByPlaceholderText('תיאור פריט');
    fireEvent.change(descriptionInput, { target: { value: 'test item' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedItems = onChange.mock.calls[0]?.[0] as LineItemFormRow[];
    expect(updatedItems[0]?.description).toBe('test item');
  });

  it('changing quantity calls onChange with updated item', async () => {
    const user = userEvent.setup();
    const { onChange } = renderLineItems({ items: [makeRow({ quantity: 1 })] });

    const quantityInput = screen.getByRole('textbox', { name: /כמות/ });
    await user.clear(quantityInput);
    await user.type(quantityInput, '5');

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as LineItemFormRow[];
    expect(lastCall[0]?.quantity).toBe(5);
  });

  it('changing unit price calls onChange with updated item', async () => {
    const user = userEvent.setup();
    const { onChange } = renderLineItems({ items: [makeRow({ unitPrice: 0 })] });

    const priceInput = screen.getByRole('textbox', { name: /מחיר יח/ });
    await user.clear(priceInput);
    await user.type(priceInput, '100');

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as LineItemFormRow[];
    expect(lastCall[0]?.unitPrice).toBe(100);
  });

  it('changing discount calls onChange with updated item', async () => {
    const user = userEvent.setup();
    const { onChange } = renderLineItems({ items: [makeRow({ discountPercent: 0 })] });

    const discountInput = screen.getByRole('textbox', { name: /הנחה/ });
    await user.clear(discountInput);
    await user.type(discountInput, '10');

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as LineItemFormRow[];
    expect(lastCall[0]?.discountPercent).toBe(10);
  });

  it('renders line total text for each row', () => {
    const items = [
      makeRow({ quantity: 1, unitPrice: 100, discountPercent: 0, vatRateBasisPoints: 1700 }),
      makeRow({ quantity: 2, unitPrice: 50, discountPercent: 0, vatRateBasisPoints: 0 }),
    ];
    renderLineItems({ items });

    // Row 1: 100 + 17% = 117.00, Row 2: 100 + 0% = 100.00
    // Both totals should be rendered as Text elements
    const texts = screen.getAllByText((_content, el) => {
      const text = el?.textContent ?? '';
      return text.includes('117') || text.includes('100');
    });
    expect(texts.length).toBeGreaterThanOrEqual(2);
  });
});
