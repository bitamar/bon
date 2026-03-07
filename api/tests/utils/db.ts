import { randomUUID } from 'node:crypto';
import { db } from '../../src/db/client.js';
import { sql } from 'drizzle-orm';
import { sessions, users } from '../../src/db/schema.js';

export async function resetDb() {
  // Use TRUNCATE CASCADE to handle all FK chains atomically.
  await db.execute(
    sql`TRUNCATE users, sessions, businesses, user_businesses, customers, invoices, invoice_items, invoice_sequences, business_shaam_credentials, emergency_allocation_numbers CASCADE`
  );
}

export async function createTestUserWithSession() {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email: `tester-${randomUUID()}@example.com`,
        name: 'Test User',
      })
      .returning();

    const now = new Date();
    const [session] = await tx
      .insert(sessions)
      .values({
        id: randomUUID(),
        userId: user.id,
        createdAt: now,
        lastAccessedAt: now,
        expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24),
      })
      .returning();

    return { user, session };
  });
}
