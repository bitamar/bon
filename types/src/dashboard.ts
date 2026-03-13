import { z } from 'zod';
import { invoiceListItemSchema } from './invoices.js';

// ── KPIs ──

export const dashboardOutstandingSchema = z.object({
  totalMinorUnits: z.number().int(),
  count: z.number().int().nonnegative(),
});

export const dashboardOverdueSchema = z.object({
  totalMinorUnits: z.number().int(),
  count: z.number().int().nonnegative(),
});

export const dashboardRevenueSchema = z.object({
  thisMonthMinorUnits: z.number().int(),
  prevMonthMinorUnits: z.number().int(),
});

export const dashboardInvoicesThisMonthSchema = z.object({
  count: z.number().int().nonnegative(),
  prevMonthCount: z.number().int().nonnegative(),
});

export const dashboardKpisSchema = z.object({
  outstanding: dashboardOutstandingSchema,
  overdue: dashboardOverdueSchema,
  revenue: dashboardRevenueSchema,
  invoicesThisMonth: dashboardInvoicesThisMonthSchema,
  staleDraftCount: z.number().int().nonnegative(),
});

// ── Response ──

export const dashboardResponseSchema = z.object({
  kpis: dashboardKpisSchema,
  recentInvoices: z.array(invoiceListItemSchema),
  overdueInvoices: z.array(invoiceListItemSchema),
  hasInvoices: z.boolean(),
});

// ── Type exports ──

export type DashboardOutstanding = z.infer<typeof dashboardOutstandingSchema>;
export type DashboardOverdue = z.infer<typeof dashboardOverdueSchema>;
export type DashboardRevenue = z.infer<typeof dashboardRevenueSchema>;
export type DashboardInvoicesThisMonth = z.infer<typeof dashboardInvoicesThisMonthSchema>;
export type DashboardKpis = z.infer<typeof dashboardKpisSchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
