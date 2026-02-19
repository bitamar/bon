import { randomInt, randomUUID } from 'node:crypto';
import { db } from '../../src/db/client.js';
import { users, businesses, userBusinesses } from '../../src/db/schema.js';
import * as sessionModule from '../../src/auth/session.js';
import { vi } from 'vitest';

export function makeRegNum(): string {
  return String(randomInt(100_000_000, 1_000_000_000));
}

export async function createUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const [user] = await db
    .insert(users)
    .values({
      email: overrides.email ?? `user-${randomUUID()}@example.com`,
      name: overrides.name ?? 'Test User',
    })
    .returning();
  return user!;
}

export async function createAuthedUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const [user] = await db
    .insert(users)
    .values({
      email: overrides.email ?? `user-${randomUUID()}@example.com`,
      name: overrides.name ?? 'Tester',
    })
    .returning();

  const sessionId = `session-${randomUUID()}`;
  const now = new Date();
  vi.spyOn(sessionModule, 'getSession').mockResolvedValue({
    id: sessionId,
    user,
    createdAt: now,
    lastAccessedAt: now,
  });

  return { user, sessionId };
}

export async function createTestBusiness(
  userId: string,
  overrides: Partial<typeof businesses.$inferInsert> = {}
) {
  const now = new Date();
  const [business] = await db
    .insert(businesses)
    .values({
      name: 'Test Business',
      businessType: 'licensed_dealer',
      registrationNumber: makeRegNum(),
      streetAddress: '1 Main St',
      city: 'Tel Aviv',
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .returning();
  return business!;
}

export async function addUserToBusiness(
  userId: string,
  businessId: string,
  role: 'owner' | 'admin' | 'user'
) {
  const [ub] = await db
    .insert(userBusinesses)
    .values({ userId, businessId, role, createdAt: new Date() })
    .returning();
  return ub!;
}
