import { useState, useEffect } from 'react';

export interface KpiItem {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  trend: number;
  trendLabel: string;
}

export interface RecentInvoice {
  id: string;
  number: string;
  customer: string;
  amount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  date: string;
}

export interface ActivityItem {
  id: string;
  type: 'invoice_created' | 'payment_received' | 'customer_added' | 'invoice_sent';
  description: string;
  amount?: number;
  timestamp: Date;
}

export interface DashboardData {
  kpis: KpiItem[];
  recentInvoices: RecentInvoice[];
  activityItems: ActivityItem[];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(amount);
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'הרגע';
  if (diffMins < 60) return `לפני ${diffMins} דקות`;
  if (diffHours < 24) return `לפני ${diffHours} שעות`;
  if (diffDays < 7) return `לפני ${diffDays} ימים`;
  return date.toLocaleDateString('he-IL');
}

export { formatCurrency, formatRelativeTime };

function createMockData(): DashboardData {
  const now = new Date();

  const kpis: KpiItem[] = [
    { label: 'הכנסות החודש', value: 47520, prefix: '₪', trend: 12.5, trendLabel: 'מהחודש הקודם' },
    { label: 'חשבוניות פתוחות', value: 8, trend: -3.2, trendLabel: 'מהחודש הקודם' },
    { label: 'לקוחות פעילים', value: 24, trend: 8.1, trendLabel: 'מהחודש הקודם' },
    { label: 'ממוצע לחשבונית', value: 5940, prefix: '₪', trend: 4.3, trendLabel: 'מהחודש הקודם' },
  ];

  const recentInvoices: RecentInvoice[] = [
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
    {
      id: '3',
      number: 'INV-003',
      customer: 'טכנולוגיות דן',
      amount: 15200,
      status: 'overdue',
      date: '2026-02-10',
    },
    {
      id: '4',
      number: 'INV-004',
      customer: 'מעבדות רפואיות',
      amount: 6300,
      status: 'draft',
      date: '2026-02-19',
    },
    {
      id: '5',
      number: 'INV-005',
      customer: 'בניה וסחר',
      amount: 22100,
      status: 'paid',
      date: '2026-02-15',
    },
  ];

  const activityItems: ActivityItem[] = [
    {
      id: '1',
      type: 'payment_received',
      description: 'התקבל תשלום מאלקטרה בע"מ',
      amount: 12400,
      timestamp: new Date(now.getTime() - 30 * 60_000),
    },
    {
      id: '2',
      type: 'invoice_sent',
      description: 'חשבונית INV-002 נשלחה לסולאר אנרגיה',
      timestamp: new Date(now.getTime() - 2 * 3_600_000),
    },
    {
      id: '3',
      type: 'customer_added',
      description: 'לקוח חדש נוסף: מעבדות רפואיות',
      timestamp: new Date(now.getTime() - 5 * 3_600_000),
    },
    {
      id: '4',
      type: 'invoice_created',
      description: 'חשבונית INV-004 נוצרה',
      amount: 6300,
      timestamp: new Date(now.getTime() - 24 * 3_600_000),
    },
    {
      id: '5',
      type: 'payment_received',
      description: 'התקבל תשלום מבניה וסחר',
      amount: 22100,
      timestamp: new Date(now.getTime() - 48 * 3_600_000),
    },
  ];

  return { kpis, recentInvoices, activityItems };
}

export function useDashboardData(): {
  data: DashboardData | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const [data, setData] = useState<DashboardData | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setData(createMockData());
      setIsLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  return { data, isLoading, error: null };
}
