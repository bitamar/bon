import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAllCities, fetchAllStreetsForCity, filterOptions } from '../../api/address';

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

describe('address api', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock as typeof fetch);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('fetchAllCities', () => {
    it('fetches and parses city records, trims names, excludes "לא רשום"', async () => {
      const mockResponse = {
        success: true,
        result: {
          records: [
            { 'שם_ישוב': 'תל אביב - יפו ', 'סמל_ישוב': '5000 ' },
            { 'שם_ישוב': 'לא רשום ', 'סמל_ישוב': '0 ' }, // should be filtered out
            { 'שם_ישוב': 'ירושלים ', 'סמל_ישוב': '3000 ' },
          ],
        },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await fetchAllCities();

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(result).toEqual([
        { name: 'תל אביב - יפו', code: '5000 ' },
        { name: 'ירושלים', code: '3000 ' },
      ]);
    });

    it('returns empty array on network error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));
      const result = await fetchAllCities();
      expect(result).toEqual([]);
    });

    it('returns empty array on malformed response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce({ unexpected: 'data' }),
      });
      const result = await fetchAllCities();
      expect(result).toEqual([]);
    });
  });

  describe('fetchAllStreetsForCity', () => {
    it('fetches streets for a given city code and trims names', async () => {
      const mockResponse = {
        success: true,
        result: {
          records: [{ 'שם_רחוב': ' רוטשילד ' }, { 'שם_רחוב': ' דיזנגוף ' }],
        },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await fetchAllStreetsForCity('5000 ');

      expect(fetchMock).toHaveBeenCalledOnce();
      const callUrl = decodeURIComponent(fetchMock.mock.calls[0]?.[0] as string);
      expect(callUrl).toContain('סמל_ישוב');
      expect(callUrl).toContain('5000');
      expect(result).toEqual([{ name: 'רוטשילד' }, { name: 'דיזנגוף' }]);
    });

    it('returns empty array on network error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));
      const result = await fetchAllStreetsForCity('5000 ');
      expect(result).toEqual([]);
    });

    it('returns empty array on malformed response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce({ bad: 'shape' }),
      });
      const result = await fetchAllStreetsForCity('5000 ');
      expect(result).toEqual([]);
    });
  });

  describe('filterOptions', () => {
    const options = [{ name: 'דיזנגוף' }, { name: 'ככר דיזנגוף' }, { name: 'רוטשילד' }];

    it('returns all options for empty query', () => {
      expect(filterOptions(options, '')).toEqual(options);
    });

    it('filters by substring (Hebrew prefix)', () => {
      expect(filterOptions(options, 'דיז')).toEqual([{ name: 'דיזנגוף' }, { name: 'ככר דיזנגוף' }]);
    });

    it('filters by mid-word substring', () => {
      expect(filterOptions(options, 'נגוף')).toEqual([
        { name: 'דיזנגוף' },
        { name: 'ככר דיזנגוף' },
      ]);
    });

    it('returns empty array when no matches', () => {
      expect(filterOptions(options, 'בגרציה')).toEqual([]);
    });
  });
});
