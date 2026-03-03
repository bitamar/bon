export const queryKeys = {
  me: () => ['me'] as const,
  settings: () => ['settings'] as const,
  userBusinesses: () => ['businesses'] as const,
  business: (id: string) => ['businesses', id] as const,
  customers: (businessId: string) => ['businesses', businessId, 'customers'] as const,
  customerSearch: (businessId: string, q: string | undefined, limit: number) =>
    ['businesses', businessId, 'customers', { q, limit }] as const,
  customer: (businessId: string, customerId: string) =>
    ['businesses', businessId, 'customers', customerId] as const,
  invoices: (businessId: string) => ['businesses', businessId, 'invoices'] as const,
  invoiceList: (businessId: string, params: Record<string, string>) =>
    ['businesses', businessId, 'invoices', 'list', params] as const,
  invoice: (businessId: string, invoiceId: string) =>
    ['businesses', businessId, 'invoices', invoiceId] as const,
};

export type QueryKey = ReturnType<(typeof queryKeys)[keyof typeof queryKeys]>;
