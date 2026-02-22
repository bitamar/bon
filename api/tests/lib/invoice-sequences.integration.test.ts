/**
 * Integration test for concurrent invoice sequence assignment.
 *
 * Runs against real PostgreSQL on port 5433 (dev DB).
 * pg-mem cannot test row-level locking (SELECT FOR UPDATE).
 *
 * Automatically skipped when:
 *   - SKIP_INTEGRATION=1 is set
 *   - Real PG on port 5433 is unreachable
 *   - The invoice_sequences table doesn't exist (migration not applied)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import * as schema from '../../src/db/schema.js';
import { assignInvoiceNumber } from '../../src/lib/invoice-sequences.js';

const DATABASE_URL = 'postgres://postgres:postgres@localhost:5433/bon_dev';

async function canConnect(): Promise<boolean> {
  if (process.env['SKIP_INTEGRATION'] === '1') return false;
  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    // Check that the required table exists
    const result = await client.query("SELECT to_regclass('public.invoice_sequences') AS cls");
    return result.rows[0]?.cls != null;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

const isAvailable = await canConnect();

describe.skipIf(!isAvailable)('assignInvoiceNumber — concurrency (real PG)', () => {
  let pool: pg.Pool;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let businessId: string;
  let userId: string;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    db = drizzle(pool, { schema });

    userId = randomUUID();
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

  afterAll(async () => {
    if (db && businessId) {
      await db
        .delete(schema.invoiceSequences)
        .where(eq(schema.invoiceSequences.businessId, businessId));
      await db.delete(schema.businesses).where(eq(schema.businesses.id, businessId));
      await db.delete(schema.users).where(eq(schema.users.id, userId));
    }
    if (pool) {
      await pool.end();
    }
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

    // Verify fullNumber format
    for (const result of results) {
      const padded = String(result.sequenceNumber).padStart(4, '0');
      expect(result.fullNumber).toBe(`INV-${padded}`);
    }
  });
});
