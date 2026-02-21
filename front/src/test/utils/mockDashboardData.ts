import type { DashboardData } from '../../hooks/useDashboardData';

export function createMockDashboardData(): DashboardData {
  return {
    kpis: [
      {
        label: 'הכנסות החודש',
        value: 47520,
        prefix: '₪',
        trend: 12.5,
        trendLabel: 'מהחודש הקודם',
      },
      { label: 'חשבוניות פתוחות', value: 8, trend: -3.2, trendLabel: 'מהחודש הקודם' },
      { label: 'לקוחות פעילים', value: 24, trend: 8.1, trendLabel: 'מהחודש הקודם' },
      {
        label: 'ממוצע לחשבונית',
        value: 5940,
        prefix: '₪',
        trend: 4.3,
        trendLabel: 'מהחודש הקודם',
      },
    ],
    recentInvoices: [
      {
        id: '1',
        number: 'INV-001',
        customer: 'אלקטרה בע"מ',
        amount: 12400,
        status: 'paid',
        date: '2026-02-18',
      },
      {
        id: '2',
        number: 'INV-002',
        customer: 'סולאר אנרגיה',
        amount: 8750,
        status: 'sent',
        date: '2026-02-17',
      },
    ],
    activityItems: [
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
    ],
  };
}
