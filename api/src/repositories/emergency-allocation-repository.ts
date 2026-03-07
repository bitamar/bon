import { and, count, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { emergencyAllocationNumbers } from '../db/schema.js';
import type { DbOrTx } from '../db/types.js';

export type EmergencyNumberRecord = (typeof emergencyAllocationNumbers)['$inferSelect'];
export type EmergencyNumberInsert = (typeof emergencyAllocationNumbers)['$inferInsert'];

export async function insertEmergencyNumbers(
  data: EmergencyNumberInsert[],
  txOrDb: DbOrTx = db
): Promise<EmergencyNumberRecord[]> {
  if (data.length === 0) return [];
  return txOrDb
    .insert(emergencyAllocationNumbers)
    .values(data)
    .onConflictDoNothing({
      target: [emergencyAllocationNumbers.businessId, emergencyAllocationNumbers.number],
    })
    .returning();
}

export async function findEmergencyNumbersByBusinessId(
  businessId: string,
  txOrDb: DbOrTx = db
): Promise<EmergencyNumberRecord[]> {
  return txOrDb
    .select()
    .from(emergencyAllocationNumbers)
    .where(eq(emergencyAllocationNumbers.businessId, businessId))
    .orderBy(emergencyAllocationNumbers.acquiredAt);
}

export async function findAvailableCount(businessId: string, txOrDb: DbOrTx = db): Promise<number> {
  const rows = await txOrDb
    .select({ value: count() })
    .from(emergencyAllocationNumbers)
    .where(
      and(
        eq(emergencyAllocationNumbers.businessId, businessId),
        eq(emergencyAllocationNumbers.used, false)
      )
    );
  return rows[0]?.value ?? 0;
}

export async function findUsedCount(businessId: string, txOrDb: DbOrTx = db): Promise<number> {
  const rows = await txOrDb
    .select({ value: count() })
    .from(emergencyAllocationNumbers)
    .where(
      and(
        eq(emergencyAllocationNumbers.businessId, businessId),
        eq(emergencyAllocationNumbers.used, true)
      )
    );
  return rows[0]?.value ?? 0;
}

/**
 * Atomically consumes the next available emergency number for a business.
 * Uses SELECT FOR UPDATE SKIP LOCKED to prevent deadlocks and double-consumption.
 * Returns null if pool is empty.
 */
export async function consumeNext(
  businessId: string,
  invoiceId: string,
  txOrDb: DbOrTx = db
): Promise<EmergencyNumberRecord | null> {
  // SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1
  const available = await txOrDb
    .select()
    .from(emergencyAllocationNumbers)
    .where(
      and(
        eq(emergencyAllocationNumbers.businessId, businessId),
        eq(emergencyAllocationNumbers.used, false)
      )
    )
    .orderBy(emergencyAllocationNumbers.acquiredAt)
    .limit(1)
    .for('update', { skipLocked: true });

  if (available.length === 0) return null;

  const selected = available[0]!;
  const updated = await txOrDb
    .update(emergencyAllocationNumbers)
    .set({
      used: true,
      usedForInvoiceId: invoiceId,
      usedAt: sql`now()`,
    })
    .where(eq(emergencyAllocationNumbers.id, selected.id))
    .returning();

  return updated[0] ?? null;
}

export async function findUnreportedUsed(
  businessId: string,
  txOrDb: DbOrTx = db
): Promise<EmergencyNumberRecord[]> {
  return txOrDb
    .select()
    .from(emergencyAllocationNumbers)
    .where(
      and(
        eq(emergencyAllocationNumbers.businessId, businessId),
        eq(emergencyAllocationNumbers.used, true),
        eq(emergencyAllocationNumbers.reported, false)
      )
    )
    .orderBy(emergencyAllocationNumbers.acquiredAt);
}

export async function markReported(ids: string[], txOrDb: DbOrTx = db): Promise<void> {
  if (ids.length === 0) return;
  for (const id of ids) {
    await txOrDb
      .update(emergencyAllocationNumbers)
      .set({ reported: true, reportedAt: sql`now()` })
      .where(eq(emergencyAllocationNumbers.id, id));
  }
}

export async function deleteEmergencyNumber(
  id: string,
  businessId: string,
  txOrDb: DbOrTx = db
): Promise<EmergencyNumberRecord | null> {
  const rows = await txOrDb
    .delete(emergencyAllocationNumbers)
    .where(
      and(
        eq(emergencyAllocationNumbers.id, id),
        eq(emergencyAllocationNumbers.businessId, businessId),
        eq(emergencyAllocationNumbers.used, false)
      )
    )
    .returning();
  return rows[0] ?? null;
}
