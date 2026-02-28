/**
 * Integration test for concurrent invoice sequence assignment.
 *
 * Runs against real PostgreSQL (testcontainers or native).
 * Tests row-level locking (SELECT FOR UPDATE) with concurrent transactions.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../../src/db/client.js';
import * as schema from '../../src/db/schema.js';
import { assignInvoiceNumber } from '../../src/lib/invoice-sequences.js';
import { resetDb } from '../utils/db.js';

describe('assignInvoiceNumber — concurrency (real PG)', () => {
  let businessId: string;

  beforeEach(async () => {
    await resetDb();

    const userId = randomUUID();
    await db.insert(schema.users).values({
      id: userId,
      email: `integration-${randomUUID()}@test.com`,
      name: 'Integration Test User',
    });

    const [business] = await db
      .insert(schema.businesses)
      .values({
        name: 'Concurrency Test Biz',
        businessType: 'licensed_dealer',
        registrationNumber: randomUUID().replaceAll('-', '').slice(0, 9),
        createdByUserId: userId,
      })
      .returning();

    businessId = business!.id;
  });

  it('50 concurrent requests produce 50 distinct sequential numbers', async () => {
    const CONCURRENCY = 50;

    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        db.transaction(async (tx) => assignInvoiceNumber(tx, businessId, 'tax_invoice', 'INV', 1))
      )
    );

    const numbers = results.map((r) => r.sequenceNumber);

    // All 50 numbers must be distinct
    expect(new Set(numbers).size).toBe(CONCURRENCY);

    // Numbers should be sequential from 1..50
    const sorted = [...numbers].sort((a, b) => a - b);
    expect(sorted[0]).toBe(1);
    expect(sorted[sorted.length - 1]).toBe(CONCURRENCY);

    // Verify documentNumber format
    for (const result of results) {
      const padded = String(result.sequenceNumber).padStart(4, '0');
      expect(result.documentNumber).toBe(`INV-${padded}`);
    }
  });
});
