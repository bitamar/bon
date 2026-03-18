import { describe, expect, it } from 'vitest';
import { fetchDashboard } from '../../api/dashboard';
import { HttpError } from '../../lib/http';
import { useFetchMock } from './fetch-mock';

const BIZ_ID = '00000000-0000-4000-8000-000000000001';

const minimalDashboardResponse = {
  revenueThisMonthMinorUnits: 100000,
  revenuePrevMonthMinorUnits: 80000,
  invoiceCountThisMonth: 5,
  invoiceCountPrevMonth: 4,
  outstandingAmountMinorUnits: 50000,
  outstandingCount: 2,
  overdueAmountMinorUnits: 10000,
  overdueCount: 1,
  shaamPendingCount: 0,
  shaamRejectedCount: 0,
  recentInvoices: [],
};

describe('dashboard api', () => {
  const { fetchMock, mockOk, mockFail } = useFetchMock();

  describe('fetchDashboard', () => {
    it('calls GET with correct URL and returns parsed DashboardResponse', async () => {
      mockOk(minimalDashboardResponse);

      const result = await fetchDashboard(BIZ_ID);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/dashboard`,
        expect.objectContaining({ credentials: 'include' })
      );
      expect(result).toMatchObject(minimalDashboardResponse);
    });

    it('throws HttpError on failure', async () => {
      mockFail(500);
      await expect(fetchDashboard(BIZ_ID)).rejects.toBeInstanceOf(HttpError);
    });
  });
});
