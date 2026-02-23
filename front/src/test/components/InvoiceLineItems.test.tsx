import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
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
    unitPriceShekel: 0,
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

    const removeButtons = screen.getAllByRole('button', { name: 'הסר שורה' });
    await user.click(removeButtons[0]!);

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
});
