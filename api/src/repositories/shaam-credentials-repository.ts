import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { businessShaamCredentials } from '../db/schema.js';
import type { DbOrTx } from '../db/types.js';

export type ShaamCredentialsRecord = (typeof businessShaamCredentials)['$inferSelect'];
export type ShaamCredentialsInsert = (typeof businessShaamCredentials)['$inferInsert'];

export async function findShaamCredentialsByBusinessId(
  businessId: string,
  txOrDb: DbOrTx = db
): Promise<ShaamCredentialsRecord | null> {
  const rows = await txOrDb
    .select()
    .from(businessShaamCredentials)
    .where(eq(businessShaamCredentials.businessId, businessId));
  return rows[0] ?? null;
}

export async function upsertShaamCredentials(
  data: ShaamCredentialsInsert,
  txOrDb: DbOrTx = db
): Promise<ShaamCredentialsRecord> {
  const rows = await txOrDb
    .insert(businessShaamCredentials)
    .values(data)
    .onConflictDoUpdate({
      target: businessShaamCredentials.businessId,
      set: {
        encryptedAccessToken: data.encryptedAccessToken,
        encryptedRefreshToken: data.encryptedRefreshToken,
        tokenExpiresAt: data.tokenExpiresAt,
        scope: data.scope,
        needsReauth: false,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return rows[0]!;
}

export async function markNeedsReauth(businessId: string, txOrDb: DbOrTx = db): Promise<void> {
  await txOrDb
    .update(businessShaamCredentials)
    .set({ needsReauth: true, updatedAt: sql`now()` })
    .where(eq(businessShaamCredentials.businessId, businessId));
}
