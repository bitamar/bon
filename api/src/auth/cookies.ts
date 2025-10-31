import { z } from 'zod';
import type { OidcCookie, Result } from './types.js';

const OidcCookieSchema = z.object({
  state: z.string().min(1),
  nonce: z.string().min(1),
  appOrigin: z.string().url(),
});

export function serializeOidcCookie(value: OidcCookie): string {
  return JSON.stringify(value);
}

export function parseOidcCookie(
  raw: string | undefined
): Result<OidcCookie, 'missing_cookie' | 'bad_cookie'> {
  if (!raw) return { ok: false, error: 'missing_cookie' };
  try {
    const json = JSON.parse(raw);
    const parsed = OidcCookieSchema.safeParse(json);
    if (!parsed.success) return { ok: false, error: 'bad_cookie' };
    return { ok: true, data: parsed.data };
  } catch {
    return { ok: false, error: 'bad_cookie' };
  }
}

export function verifyStateMatch(
  cookieState: string,
  queryState: string
): Result<true, 'state_mismatch'> {
  if (cookieState !== queryState) return { ok: false, error: 'state_mismatch' };
  return { ok: true, data: true };
}
