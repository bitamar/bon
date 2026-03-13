import { fetchJson } from '../lib/http';
import { dashboardResponseSchema, type DashboardResponse } from '@bon/types/dashboard';

export async function fetchDashboard(businessId: string): Promise<DashboardResponse> {
  const json = await fetchJson<unknown>(`/businesses/${businessId}/dashboard`);
  return dashboardResponseSchema.parse(json);
}
