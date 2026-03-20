import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { resetDb } from '../utils/db.js';
import { db } from '../../src/db/client.js';
import { users } from '../../src/db/schema.js';
import { getSettingsFromUser, updateSettingsForUser } from '../../src/services/user-service.js';
import * as userRepository from '../../src/repositories/user-repository.js';

async function createUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const [user] = await db
    .insert(users)
    .values({
      email: overrides.email ?? `user-service-${randomUUID()}@example.com`,
      name: overrides.name ?? 'Initial Name',
      phone: overrides.phone ?? null,
      whatsappEnabled: overrides.whatsappEnabled ?? true,
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

  it('serializes settings including whatsappEnabled', async () => {
    const user = await createUser({
      name: 'Grace Hopper',
      phone: '+972501234567',
      whatsappEnabled: true,
    });

    const settings = getSettingsFromUser({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      whatsappEnabled: user.whatsappEnabled,
    });

    expect(settings.user).toMatchObject({
      id: user.id,
      name: 'Grace Hopper',
      phone: '+972501234567',
      whatsappEnabled: true,
    });
  });

  it('normalizes phone to E.164 on update', async () => {
    const user = await createUser({ name: 'Before Update', phone: null });

    const response = await updateSettingsForUser(user.id, {
      name: 'After Update',
      phone: '050-7654321',
    });

    expect(response.user).toMatchObject({
      name: 'After Update',
      phone: '+972507654321',
    });

    const row = await db.query.users.findFirst({
      where: (table, { eq }) => eq(table.id, user.id),
    });
    expect(row?.name).toBe('After Update');
    expect(row?.phone).toBe('+972507654321');
  });

  it('rejects invalid phone format with 400', async () => {
    const user = await createUser();

    await expect(updateSettingsForUser(user.id, { phone: '123' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'invalid_phone',
    });
  });

  it('clears phone when null is passed', async () => {
    const user = await createUser({ phone: '+972501234567' });

    const response = await updateSettingsForUser(user.id, { phone: null });

    expect(response.user.phone).toBeNull();
  });

  it('updates whatsappEnabled independently', async () => {
    const user = await createUser({ whatsappEnabled: true });

    const response = await updateSettingsForUser(user.id, { whatsappEnabled: false });

    expect(response.user.whatsappEnabled).toBe(false);
  });

  it('throws conflict with code duplicate_phone when updateUserById throws a 23505 error', async () => {
    const pgError = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
    });
    const spy = vi.spyOn(userRepository, 'updateUserById').mockRejectedValueOnce(pgError);

    await expect(
      updateSettingsForUser(randomUUID(), { phone: '050-0000000' })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'duplicate_phone',
    });

    spy.mockRestore();
  });
});
