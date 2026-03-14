import {
  aggregateRevenue,
  aggregateOutstanding,
  aggregateOverdue,
  aggregateShaamStatus,
  findInvoices,
  type InvoiceListFilters,
} from '../repositories/invoice-repository.js';
import type { DashboardResponse } from '@bon/types/dashboard';
import { serializeInvoiceListItem } from '../lib/invoice-serializers.js';

function getMonthBoundaries(now: Date): {
  thisMonthStart: string;
  thisMonthEnd: string;
  prevMonthStart: string;
  prevMonthEnd: string;
} {
  // Use Israel timezone for month boundaries
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayStr = formatter.format(now);
  const [yearStr, monthStr] = todayStr.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  const thisMonthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const thisMonthEnd = todayStr;

  // Previous month
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const lastDayOfPrevMonth = new Date(year, month - 1, 0).getDate();
  const prevMonthStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
  const prevMonthEnd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDayOfPrevMonth).padStart(2, '0')}`;

  return { thisMonthStart, thisMonthEnd, prevMonthStart, prevMonthEnd };
}

export async function getDashboard(businessId: string): Promise<DashboardResponse> {
  const now = new Date();
  const { thisMonthStart, thisMonthEnd, prevMonthStart, prevMonthEnd } = getMonthBoundaries(now);

  const baseFilters: InvoiceListFilters = {
    businessId,
    sort: 'createdAt:desc',
    offset: 0,
    limit: 10,
  };

  const [revenue, prevRevenue, outstanding, overdue, shaam, recent] = await Promise.all([
    aggregateRevenue(businessId, thisMonthStart, thisMonthEnd),
    aggregateRevenue(businessId, prevMonthStart, prevMonthEnd),
    aggregateOutstanding(baseFilters),
    aggregateOverdue(businessId),
    aggregateShaamStatus(businessId),
    findInvoices(baseFilters),
  ]);

  return {
    revenueThisMonthMinorUnits: revenue.total,
    revenuePrevMonthMinorUnits: prevRevenue.total,
    invoiceCountThisMonth: revenue.count,
    invoiceCountPrevMonth: prevRevenue.count,
    outstandingAmountMinorUnits: outstanding.total,
    outstandingCount: outstanding.count,
    overdueAmountMinorUnits: overdue.total,
    overdueCount: overdue.count,
    shaamPendingCount: shaam.pending,
    shaamRejectedCount: shaam.rejected,
    recentInvoices: recent.map(serializeInvoiceListItem),
  };
}
