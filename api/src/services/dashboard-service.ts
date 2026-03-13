import {
  getDashboardAggregates,
  findInvoices,
  type InvoiceListFilters,
} from '../repositories/invoice-repository.js';
import { sumPaymentsForPeriod } from '../repositories/payment-repository.js';
import { serializeInvoiceListItem } from './invoice-service.js';
import type { DashboardResponse, DashboardKpis } from '@bon/types/dashboard';

function getMonthBoundaries() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const thisMonthStart = new Date(Date.UTC(year, month, 1));
  const prevMonthStart = new Date(Date.UTC(year, month - 1, 1));
  const nextMonthStart = new Date(Date.UTC(year, month + 1, 1));
  return {
    thisMonthStart: thisMonthStart.toISOString().slice(0, 10),
    prevMonthStart: prevMonthStart.toISOString().slice(0, 10),
    nextMonthStart: nextMonthStart.toISOString().slice(0, 10),
  };
}

const STALE_DRAFT_DAYS = 7;

export async function getDashboardData(businessId: string): Promise<DashboardResponse> {
  const { thisMonthStart, prevMonthStart, nextMonthStart } = getMonthBoundaries();
  const staleThreshold = new Date(Date.now() - STALE_DRAFT_DAYS * 24 * 60 * 60 * 1000);

  const recentFilters: InvoiceListFilters = {
    businessId,
    sort: 'createdAt:desc',
    offset: 0,
    limit: 10,
  };

  const overdueFilters: InvoiceListFilters = {
    businessId,
    isOverdue: true,
    sort: 'dueDate:asc',
    offset: 0,
    limit: 5,
  };

  const [aggregates, revenueThisMonth, revenuePrevMonth, recentRows, overdueRows] =
    await Promise.all([
      getDashboardAggregates(businessId, thisMonthStart, prevMonthStart, staleThreshold),
      sumPaymentsForPeriod(businessId, thisMonthStart, nextMonthStart),
      sumPaymentsForPeriod(businessId, prevMonthStart, thisMonthStart),
      findInvoices(recentFilters),
      findInvoices(overdueFilters),
    ]);

  const kpis: DashboardKpis = {
    outstanding: {
      totalMinorUnits: aggregates.outstandingTotal,
      count: aggregates.outstandingCount,
    },
    overdue: {
      totalMinorUnits: aggregates.overdueTotal,
      count: aggregates.overdueCount,
    },
    revenue: {
      thisMonthMinorUnits: revenueThisMonth,
      prevMonthMinorUnits: revenuePrevMonth,
    },
    invoicesThisMonth: {
      count: aggregates.invoicesThisMonth,
      prevMonthCount: aggregates.invoicesPrevMonth,
    },
    staleDraftCount: aggregates.staleDraftCount,
  };

  return {
    kpis,
    recentInvoices: recentRows.map(serializeInvoiceListItem),
    overdueInvoices: overdueRows.map(serializeInvoiceListItem),
    hasInvoices: aggregates.hasInvoices,
  };
}
