import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { ActivityFeed } from '../../components/ActivityFeed';
import { renderWithProviders } from '../utils/renderWithProviders';
import type { ActivityItem } from '../../hooks/useDashboardData';

const mockItems: ActivityItem[] = [
  {
    id: '1',
    type: 'payment_received',
    description: 'התקבל תשלום מאלקטרה בע"מ',
    amount: 12400,
    timestamp: new Date('2026-02-20T10:00:00'),
  },
  {
    id: '2',
    type: 'customer_added',
    description: 'לקוח חדש נוסף: סולאר אנרגיה',
    timestamp: new Date('2026-02-19T08:00:00'),
  },
];

describe('ActivityFeed', () => {
  it('renders activity items with descriptions', () => {
    renderWithProviders(<ActivityFeed items={mockItems} />);

    expect(screen.getByText('פעילות אחרונה')).toBeInTheDocument();
    expect(screen.getByText('התקבל תשלום מאלקטרה בע"מ')).toBeInTheDocument();
    expect(screen.getByText('לקוח חדש נוסף: סולאר אנרגיה')).toBeInTheDocument();
  });

  it('renders empty state when no items', () => {
    renderWithProviders(<ActivityFeed items={[]} />);

    expect(screen.getByText('אין פעילות להצגה')).toBeInTheDocument();
  });

  it('renders loading skeleton', () => {
    const { container } = renderWithProviders(<ActivityFeed items={undefined} isLoading />);

    const skeletons = container.querySelectorAll('[data-visible="true"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
