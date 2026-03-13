import {
  getDashboardAggregates,
  findInvoices,
  type InvoiceListFilters,
} from '../repositories/invoice-repository.js';
import { sumPaymentsForPeriod } from '../repositories/payment-repository.js';
import type { DashboardResponse, DashboardKpis } from '@bon/types/dashboard';
import type { InvoiceListItem } from '@bon/types/invoices';

type InvoiceRecord = Awaited<ReturnType<typeof findInvoices>>[number];

function serializeInvoiceListItem(record: InvoiceRecord): InvoiceListItem {
  return {
    id: record.id,
    businessId: record.businessId,
    customerId: record.customerId ?? null,
    customerName: record.customerName ?? null,
    documentType: record.documentType,
    status: record.status,
    isOverdue: record.isOverdue,
    sequenceGroup: record.sequenceGroup ?? null,
    documentNumber: record.documentNumber ?? null,
    invoiceDate: record.invoiceDate,
    dueDate: record.dueDate ?? null,
    totalInclVatMinorUnits: record.totalInclVatMinorUnits,
    currency: record.currency,
    createdAt: record.createdAt.toISOString(),
  };
}

function getMonthBoundaries() {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    thisMonthStart: thisMonthStart.toISOString().slice(0, 10),
    prevMonthStart: prevMonthStart.toISOString().slice(0, 10),
    nextMonthStart: nextMonthStart.toISOString().slice(0, 10),
  };
}

const STALE_DRAFT_DAYS = 14;

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
