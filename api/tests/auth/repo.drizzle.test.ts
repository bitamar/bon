import { describe, expect, it, vi } from 'vitest';
import { DrizzleUserRepository } from '../../src/auth/repo.drizzle.js';
import { users } from '../../src/db/schema.js';

function createRepoWithMocks(returnedUser: unknown) {
  const returningMock = vi.fn().mockResolvedValue([returnedUser]);
  const onConflictMock = vi.fn().mockReturnValue({ returning: returningMock });
  const valuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictMock });
  const insertMock = vi.fn().mockReturnValue({ values: valuesMock });

  const fakeDb = {
    insert: insertMock,
  } as unknown as Parameters<ConstructorParameters<typeof DrizzleUserRepository>[0]>[0];

  return {
    repo: new DrizzleUserRepository(fakeDb),
    insertMock,
    valuesMock,
    onConflictMock,
    returningMock,
  };
}

describe('DrizzleUserRepository', () => {
  it('returns the created user when no conflict occurs', async () => {
    const now = new Date('2024-01-01T00:00:00Z');
    const fakeUser = {
      id: 'user-123',
      email: 'create@example.com',
      googleId: 'google-1',
      name: 'Created User',
      avatarUrl: 'https://example.com/avatar.png',
      updatedAt: now,
      lastLoginAt: now,
    };

    const { repo, insertMock, valuesMock, onConflictMock, returningMock } =
      createRepoWithMocks(fakeUser);

    const result = await repo.upsertByEmail({
      email: 'create@example.com',
      googleId: 'google-1',
      name: 'Created User',
      avatarUrl: 'https://example.com/avatar.png',
      now,
    });

    expect(insertMock).toHaveBeenCalledWith(users);
    expect(valuesMock).toHaveBeenCalledWith({
      email: 'create@example.com',
      googleId: 'google-1',
      name: 'Created User',
      avatarUrl: 'https://example.com/avatar.png',
      updatedAt: now,
      lastLoginAt: now,
    });
    expect(onConflictMock).toHaveBeenCalledWith({
      target: users.email,
      set: {
        googleId: 'google-1',
        avatarUrl: 'https://example.com/avatar.png',
        updatedAt: now,
        lastLoginAt: now,
      },
    });
    expect(returningMock).toHaveBeenCalled();
    expect(result).toBe(fakeUser);
  });

  it('returns the updated user when an email conflict occurs', async () => {
    const now = new Date('2024-02-01T00:00:00Z');
    const updatedUser = {
      id: 'user-123',
      email: 'update@example.com',
      googleId: 'google-updated',
      name: 'Initial',
      avatarUrl: 'https://example.com/b.png',
      updatedAt: now,
      lastLoginAt: now,
    };

    const { repo, valuesMock } = createRepoWithMocks(updatedUser);

    const result = await repo.upsertByEmail({
      email: 'update@example.com',
      googleId: 'google-updated',
      name: 'Initial',
      avatarUrl: 'https://example.com/b.png',
      now,
    });

    expect(valuesMock).toHaveBeenCalledWith({
      email: 'update@example.com',
      googleId: 'google-updated',
      name: 'Initial',
      avatarUrl: 'https://example.com/b.png',
      updatedAt: now,
      lastLoginAt: now,
    });
    expect(result).toBe(updatedUser);
  });

  it('throws AppError when no row is returned', async () => {
    const returningMock = vi.fn().mockResolvedValue([]);
    const onConflictMock = vi.fn().mockReturnValue({ returning: returningMock });
    const valuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictMock });
    const insertMock = vi.fn().mockReturnValue({ values: valuesMock });

    const fakeDb = { insert: insertMock } as unknown as Parameters<
      ConstructorParameters<typeof DrizzleUserRepository>[0]
    >[0];

    const repo = new DrizzleUserRepository(fakeDb);

    await expect(
      repo.upsertByEmail({
        email: 'missing@example.com',
        googleId: 'google-missing',
        name: null,
        avatarUrl: null,
        now: new Date(),
      })
    ).rejects.toMatchObject({ code: 'user_not_found' });

    expect(insertMock).toHaveBeenCalledWith(users);
    expect(returningMock).toHaveBeenCalled();
  });
});
