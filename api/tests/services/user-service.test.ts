import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { resetDb } from '../utils/db.js';
import { db } from '../../src/db/client.js';
import { users } from '../../src/db/schema.js';
import { getSettingsFromUser, updateSettingsForUser } from '../../src/services/user-service.js';

async function createUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const [user] = await db
    .insert(users)
    .values({
      email: overrides.email ?? `user-service-${randomUUID()}@example.com`,
      name: overrides.name ?? 'Initial Name',
      phone: overrides.phone ?? null,
    })
    .returning();
  return user;
}

describe('user-service', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  it('serializes settings for a user', async () => {
    const user = await createUser({ name: 'Grace Hopper', phone: '050-1234567' });

    const settings = getSettingsFromUser({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
    });

    expect(settings.user).toMatchObject({
      id: user.id,
      name: 'Grace Hopper',
      phone: '050-1234567',
    });
  });

  it('updates user settings', async () => {
    const user = await createUser({ name: 'Before Update', phone: null });

    const response = await updateSettingsForUser(user.id, {
      name: 'After Update',
      phone: '050-7654321',
    });

    expect(response.user).toMatchObject({ name: 'After Update', phone: '050-7654321' });

    const row = await db.query.users.findFirst({
      where: (table, { eq }) => eq(table.id, user.id),
    });
    expect(row?.name).toBe('After Update');
    expect(row?.phone).toBe('050-7654321');
  });
});
