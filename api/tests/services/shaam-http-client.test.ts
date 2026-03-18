import { describe, expect, it } from 'vitest';
import { ShaamHttpClient } from '../../src/services/shaam/http-client.js';
import type { AllocationRequest } from '../../src/services/shaam/types.js';

// ── helpers ──

const BASE_URL = 'https://shaam.example.com';

function makeRequest(): AllocationRequest {
  return {
    businessId: '00000000-0000-0000-0000-000000000001',
    invoiceId: '00000000-0000-0000-0000-000000000002',
    documentType: 'tax_invoice',
    documentNumber: 'INV-0001',
    invoiceDate: '2026-01-15',
    totalExclVatMinorUnits: 1_000_000,
    vatMinorUnits: 170_000,
    totalInclVatMinorUnits: 1_170_000,
    customerTaxId: null,
    items: [
      {
        description: 'Service',
        quantity: 1,
        unitPriceMinorUnits: 1_000_000,
        lineTotalMinorUnits: 1_000_000,
      },
    ],
  };
}

describe('ShaamHttpClient', () => {
  it('requestAllocationNumber throws with "not implemented" message containing the baseUrl', async () => {
    const client = new ShaamHttpClient(BASE_URL);
    await expect(client.requestAllocationNumber(makeRequest())).rejects.toThrow(BASE_URL);
    await expect(client.requestAllocationNumber(makeRequest())).rejects.toThrow('not implemented');
  });

  it('reportEmergencyUsage throws with "not implemented" message containing the baseUrl', async () => {
    const client = new ShaamHttpClient(BASE_URL);
    await expect(client.reportEmergencyUsage('biz-id', [])).rejects.toThrow(BASE_URL);
    await expect(client.reportEmergencyUsage('biz-id', [])).rejects.toThrow('not implemented');
  });
});
