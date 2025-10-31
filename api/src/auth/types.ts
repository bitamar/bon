export type Result<TSuccess, TError extends string> =
  | { ok: true; data: TSuccess }
  | { ok: false; error: TError };

export type AuthError =
  | 'invalid_query'
  | 'missing_cookie'
  | 'bad_cookie'
  | 'state_mismatch'
  | 'oauth_exchange_failed'
  | 'missing_claims'
  | 'invalid_claims'
  | 'email_unverified';

export interface Claims {
  sub: string;
  email: string;
  email_verified?: boolean | undefined;
  name?: string | null | undefined;
  picture?: string | null | undefined;
}

import type { InferSelectModel } from 'drizzle-orm';
import { users } from '../db/schema.js';

export type DbUser = InferSelectModel<typeof users>;

export interface UserRepository {
  upsertByEmail(input: {
    email: string;
    googleId: string;
    name: string | null;
    avatarUrl: string | null;
    now: Date;
  }): Promise<DbUser>;
}

export interface SessionData {
  id: string;
  user: DbUser;
  createdAt: Date;
  lastAccessedAt: Date;
}

export interface OidcCookie {
  state: string;
  nonce: string;
  appOrigin: string;
}
