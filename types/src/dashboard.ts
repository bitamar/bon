import { z } from 'zod';
import { invoiceListItemSchema } from './invoices.js';

export const dashboardResponseSchema = z.object({
  revenueThisMonthMinorUnits: z.number().int(),
  revenuePrevMonthMinorUnits: z.number().int(),
  invoiceCountThisMonth: z.number().int().nonnegative(),
  invoiceCountPrevMonth: z.number().int().nonnegative(),
  outstandingAmountMinorUnits: z.number().int(),
  outstandingCount: z.number().int().nonnegative(),
  overdueAmountMinorUnits: z.number().int(),
  overdueCount: z.number().int().nonnegative(),
  shaamPendingCount: z.number().int().nonnegative(),
  shaamRejectedCount: z.number().int().nonnegative(),
  recentInvoices: z.array(invoiceListItemSchema),
});

export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
