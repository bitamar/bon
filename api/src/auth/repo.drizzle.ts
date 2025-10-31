import type { DbUser, UserRepository } from './types.js';
import { db as defaultDb } from '../db/client.js';
import { users } from '../db/schema.js';
import { AppError } from '../lib/app-error.js';

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db = defaultDb) {}

  async upsertByEmail(input: {
    email: string;
    googleId: string;
    name: string | null;
    avatarUrl: string | null;
    now: Date;
  }): Promise<DbUser> {
    const { email, googleId, name, avatarUrl, now } = input;

    const [user] = await this.db
      .insert(users)
      .values({
        email,
        googleId,
        name,
        avatarUrl,
        updatedAt: now,
        lastLoginAt: now,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          googleId,
          avatarUrl,
          updatedAt: now,
          lastLoginAt: now,
        },
      })
      .returning();

    if (!user)
      throw new AppError({
        statusCode: 404,
        code: 'user_not_found',
        message: 'User could not be created',
      });

    return user;
  }
}
