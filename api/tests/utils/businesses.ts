import { randomInt, randomUUID } from 'node:crypto';
import { db } from '../../src/db/client.js';
import { users, businesses, userBusinesses, businessInvitations } from '../../src/db/schema.js';
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

/** Creates an authenticated user who owns a new business. */
export async function createOwnerWithBusiness() {
  const { user, sessionId } = await createAuthedUser();
  const business = await createTestBusiness(user.id);
  await addUserToBusiness(user.id, business.id, 'owner');
  return { user, sessionId, business };
}

/**
 * Creates an authenticated user who is a member (with the given role) in a business
 * owned by a separate, non-authed user.
 */
export async function createMemberInBusiness(role: 'owner' | 'admin' | 'user') {
  const { user, sessionId } = await createAuthedUser();
  const ownerUser = await createUser();
  const business = await createTestBusiness(ownerUser.id);
  await addUserToBusiness(ownerUser.id, business.id, 'owner');
  await addUserToBusiness(user.id, business.id, role);
  return { user, sessionId, business, ownerUser };
}

export async function createPendingInvitation(
  businessId: string,
  invitedByUserId: string,
  email: string,
  role: 'admin' | 'user' = 'user'
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [inv] = await db
    .insert(businessInvitations)
    .values({
      businessId,
      email,
      role,
      invitedByUserId,
      token: randomUUID(),
      status: 'pending',
      expiresAt,
      createdAt: now,
    })
    .returning();
  return inv!;
}
