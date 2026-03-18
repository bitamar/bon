import { beforeEach, describe, expect, it } from 'vitest';
import { ShaamMockClient } from '../../src/services/shaam/mock-client.js';
import type { AllocationRequest } from '../../src/services/shaam/types.js';

// ── helpers ──

function makeRequest(): AllocationRequest {
  return {
    businessId: '00000000-0000-0000-0000-000000000001',
    invoiceId: '00000000-0000-0000-0000-000000000002',
    documentType: 'tax_invoice',
    documentNumber: 'INV-0001',
    invoiceDate: '2026-01-15',
    totalExclVatMinorUnits: 1_500_000,
    vatMinorUnits: 255_000,
    totalInclVatMinorUnits: 1_755_000,
    customerTaxId: '123456789',
    items: [
      {
        description: 'Consulting',
        quantity: 10,
        unitPriceMinorUnits: 150_000,
        lineTotalMinorUnits: 1_500_000,
      },
    ],
  };
}

describe('ShaamMockClient', () => {
  let client: ShaamMockClient;

  beforeEach(() => {
    client = new ShaamMockClient(0);
  });

  it('returns an approved allocation result', async () => {
    const result = await client.requestAllocationNumber(makeRequest());

    expect(result.status).toBe('approved');
    if (result.status === 'approved') {
      expect(result.allocationNumber).toMatch(/^MOCK-/);
    }
  });

  it('returns unique allocation numbers per call', async () => {
    const r1 = await client.requestAllocationNumber(makeRequest());
    const r2 = await client.requestAllocationNumber(makeRequest());

    expect(r1.status).toBe('approved');
    expect(r2.status).toBe('approved');
    if (r1.status === 'approved' && r2.status === 'approved') {
      expect(r1.allocationNumber).not.toBe(r2.allocationNumber);
    }
  });

  it('resolves without delay when delayMs is 0', async () => {
    const start = Date.now();
    await client.requestAllocationNumber(makeRequest());
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('applies delay when delayMs > 0 for requestAllocationNumber', async () => {
    const delayedClient = new ShaamMockClient(20);
    const start = Date.now();
    await delayedClient.requestAllocationNumber(makeRequest());
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(15);
  });

  it('applies delay when delayMs > 0 for reportEmergencyUsage', async () => {
    const delayedClient = new ShaamMockClient(20);
    const start = Date.now();
    await delayedClient.reportEmergencyUsage('biz-1', []);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(15);
  });

  it('reportEmergencyUsage resolves without error', async () => {
    await expect(client.reportEmergencyUsage('biz-1', [])).resolves.toBeUndefined();
  });
});
