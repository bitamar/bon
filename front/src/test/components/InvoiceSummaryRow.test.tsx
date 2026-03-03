import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { InvoiceSummaryRow } from '../../components/InvoiceSummaryRow';
import { renderWithProviders } from '../utils/renderWithProviders';
import type { InvoiceListAggregates } from '@bon/types/invoices';

function makeAggregates(overrides: Partial<InvoiceListAggregates> = {}): InvoiceListAggregates {
  return {
    totalOutstandingMinorUnits: 0,
    countOutstanding: 0,
    totalFilteredMinorUnits: 0,
    ...overrides,
  };
}

describe('InvoiceSummaryRow', () => {
  it('renders outstanding amount and count', () => {
    renderWithProviders(
      <InvoiceSummaryRow
        aggregates={makeAggregates({
          totalOutstandingMinorUnits: 150000,
          countOutstanding: 3,
        })}
      />
    );

    expect(screen.getByText('ממתין לתשלום:')).toBeInTheDocument();
    expect(screen.getByText(/1,500/)).toBeInTheDocument();
    expect(screen.getByText(/3 חשבוניות/)).toBeInTheDocument();
  });

  it('renders filtered total', () => {
    renderWithProviders(
      <InvoiceSummaryRow
        aggregates={makeAggregates({
          totalFilteredMinorUnits: 250000,
        })}
      />
    );

    expect(screen.getByText('סה״כ בסינון:')).toBeInTheDocument();
    expect(screen.getByText(/2,500/)).toBeInTheDocument();
  });

  it('uses singular form for count of 1', () => {
    renderWithProviders(<InvoiceSummaryRow aggregates={makeAggregates({ countOutstanding: 1 })} />);

    expect(screen.getByText(/חשבונית\)/)).toBeInTheDocument();
    expect(screen.queryByText(/חשבוניות/)).not.toBeInTheDocument();
  });

  it('renders zero amounts correctly', () => {
    renderWithProviders(<InvoiceSummaryRow aggregates={makeAggregates()} />);

    expect(screen.getByText('ממתין לתשלום:')).toBeInTheDocument();
    expect(screen.getByText('סה״כ בסינון:')).toBeInTheDocument();
    expect(screen.getByText(/0 חשבוניות/)).toBeInTheDocument();
  });
});
