import { z } from 'zod';

const BASE_URL = 'https://data.gov.il/api/3/action/datastore_search';
const CITIES_RESOURCE_ID = '5c78e9fa-c2e2-4771-93ff-7f400a12f7ba';
const STREETS_RESOURCE_ID = 'a7296d1a-f8c9-4b70-96c2-6ebb4352f8e3';

const cityRecordSchema = z.object({
  'שם_ישוב': z.string(),
  'סמל_ישוב': z.string(), // stored as text with trailing spaces e.g. "5000 "
});

const streetRecordSchema = z.object({
  'שם_רחוב': z.string(),
});

const dataGovResponseSchema = <T extends z.ZodType>(recordSchema: T) =>
  z.object({
    success: z.boolean(),
    result: z.object({
      records: z.array(recordSchema),
    }),
  });

export interface CityOption {
  name: string;
  code: string; // raw text code including trailing space, e.g. "5000 "
}

export interface StreetOption {
  name: string;
}

/** Fetch all ~1300 Israeli cities/settlements in one request. Cache forever — they rarely change. */
export async function fetchAllCities(): Promise<CityOption[]> {
  try {
    const url = new URL(BASE_URL);
    url.searchParams.set('resource_id', CITIES_RESOURCE_ID);
    url.searchParams.set('limit', '1500');
    url.searchParams.set('fields', 'שם_ישוב,סמל_ישוב');

    const response = await fetch(url.toString());
    const json: unknown = await response.json();

    const parsed = dataGovResponseSchema(cityRecordSchema).safeParse(json);
    if (!parsed.success) return [];

    return parsed.data.result.records
      .map((r) => ({
        name: r['שם_ישוב'].trim(),
        code: r['סמל_ישוב'], // keep raw value (with trailing space) for use as filter
      }))
      .filter((c) => c.name && c.name !== 'לא רשום');
  } catch {
    return [];
  }
}

/** Fetch all streets for a given city code in one request. Cache per city. */
export async function fetchAllStreetsForCity(cityCode: string): Promise<StreetOption[]> {
  try {
    const url = new URL(BASE_URL);
    url.searchParams.set('resource_id', STREETS_RESOURCE_ID);
    url.searchParams.set('filters', JSON.stringify({ 'סמל_ישוב': cityCode }));
    url.searchParams.set('limit', '5000');
    url.searchParams.set('fields', 'שם_רחוב');

    const response = await fetch(url.toString());
    const json: unknown = await response.json();

    const parsed = dataGovResponseSchema(streetRecordSchema).safeParse(json);
    if (!parsed.success) return [];

    return parsed.data.result.records
      .map((r) => ({ name: r['שם_רחוב'].trim() }))
      .filter((s) => s.name);
  } catch {
    return [];
  }
}

/** Client-side substring filter for Hebrew text. */
export function filterOptions<T extends { name: string }>(options: T[], query: string): T[] {
  const q = query.trim();
  if (!q) return options;
  return options.filter((o) => o.name.includes(q));
}
