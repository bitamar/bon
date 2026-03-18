import { describe, expect, it } from 'vitest';
import {
  fetchEmergencyNumbers,
  addEmergencyNumbers,
  deleteEmergencyNumber,
} from '../../api/emergency-numbers';
import { HttpError } from '../../lib/http';
import { useFetchMock } from './fetch-mock';

const BIZ_ID = '00000000-0000-4000-8000-000000000001';
const NUMBER_ID = '00000000-0000-4000-8000-000000000002';

const minimalEmergencyNumber = {
  id: NUMBER_ID,
  businessId: BIZ_ID,
  number: '12345678',
  used: false,
  usedForInvoiceId: null,
  usedAt: null,
  reported: false,
  reportedAt: null,
  acquiredAt: '2026-03-15T00:00:00.000Z',
};

const minimalEmergencyNumbersResponse = {
  numbers: [minimalEmergencyNumber],
  availableCount: 1,
  usedCount: 0,
};

describe('emergency-numbers api', () => {
  const { fetchMock, mockOk, mockFail } = useFetchMock();

  describe('fetchEmergencyNumbers', () => {
    it('calls GET with correct URL and returns parsed EmergencyNumbersResponse', async () => {
      mockOk(minimalEmergencyNumbersResponse);

      const result = await fetchEmergencyNumbers(BIZ_ID);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/emergency-numbers`,
        expect.objectContaining({ credentials: 'include' })
      );
      expect(result).toMatchObject(minimalEmergencyNumbersResponse);
    });

    it('throws HttpError on failure', async () => {
      mockFail(500);
      await expect(fetchEmergencyNumbers(BIZ_ID)).rejects.toBeInstanceOf(HttpError);
    });
  });

  describe('addEmergencyNumbers', () => {
    it('calls POST with correct URL and body and returns parsed EmergencyNumbersResponse', async () => {
      mockOk(minimalEmergencyNumbersResponse);
      const body = { numbers: ['12345678'] };

      const result = await addEmergencyNumbers(BIZ_ID, body);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/emergency-numbers`,
        expect.objectContaining({
          credentials: 'include',
          method: 'POST',
          body: JSON.stringify(body),
        })
      );
      expect(result).toMatchObject(minimalEmergencyNumbersResponse);
    });

    it('throws HttpError on failure', async () => {
      mockFail(400);
      await expect(addEmergencyNumbers(BIZ_ID, { numbers: ['12345678'] })).rejects.toBeInstanceOf(
        HttpError
      );
    });
  });

  describe('deleteEmergencyNumber', () => {
    it('calls DELETE with correct URL and returns { ok: true }', async () => {
      mockOk({ ok: true });

      const result = await deleteEmergencyNumber(BIZ_ID, NUMBER_ID);

      expect(fetchMock).toHaveBeenCalledWith(
        `${import.meta.env.VITE_API_BASE_URL}/businesses/${BIZ_ID}/emergency-numbers/${NUMBER_ID}`,
        expect.objectContaining({
          credentials: 'include',
          method: 'DELETE',
        })
      );
      expect(result).toEqual({ ok: true });
    });

    it('throws HttpError on failure', async () => {
      mockFail(404);
      await expect(deleteEmergencyNumber(BIZ_ID, NUMBER_ID)).rejects.toBeInstanceOf(HttpError);
    });
  });
});
