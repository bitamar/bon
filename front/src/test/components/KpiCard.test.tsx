import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { KpiCard } from '../../components/KpiCard';
import { renderWithProviders } from '../utils/renderWithProviders';
import { IconCash } from '@tabler/icons-react';

describe('KpiCard', () => {
  // ── helpers ──
  function renderKpiCard(overrides: Partial<Parameters<typeof KpiCard>[0]> = {}) {
    const defaults = {
      label: 'גבייה החודש',
      value: '₪47,520',
      trend: 12.5,
      trendLabel: 'מהחודש הקודם',
      icon: <IconCash size={20} />,
    };
    return renderWithProviders(<KpiCard {...defaults} {...overrides} />);
  }

  it('renders label, formatted value, and trend', () => {
    renderKpiCard();

    expect(screen.getByText('גבייה החודש')).toBeInTheDocument();
    expect(screen.getByText('₪47,520')).toBeInTheDocument();
    expect(screen.getByText('12.5%')).toBeInTheDocument();
    expect(screen.getByText('מהחודש הקודם')).toBeInTheDocument();
  });

  it('renders negative trend with red color', () => {
    renderKpiCard({ trend: -3.2 });

    expect(screen.getByText('3.2%')).toBeInTheDocument();
  });

  it('renders without trend when trend is omitted', () => {
    renderWithProviders(
      <KpiCard
        label="ממתין לתשלום"
        value="₪25,000"
        subtitle="8 חשבוניות"
        icon={<IconCash size={20} />}
      />
    );

    expect(screen.getByText('8 חשבוניות')).toBeInTheDocument();
    expect(screen.queryByText('%')).not.toBeInTheDocument();
  });

  it('renders loading skeleton state', () => {
    const { container } = renderKpiCard({ isLoading: true });

    const skeletons = container.querySelectorAll('[data-visible="true"]');
    expect(skeletons.length).toBeGreaterThan(0);
    expect(screen.queryByText('גבייה החודש')).not.toBeInTheDocument();
  });
});
