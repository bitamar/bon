import { z } from 'zod';
import type { Claims, Result } from './types.js';

const CallbackQuery = z.object({ code: z.string().min(1), state: z.string().min(1) });

export function validateCallbackQuery(
  query: unknown
): Result<z.infer<typeof CallbackQuery>, 'invalid_query'> {
  const parsed = CallbackQuery.safeParse(query);
  if (!parsed.success) return { ok: false, error: 'invalid_query' };
  return { ok: true, data: parsed.data };
}

const ClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z.boolean().optional(),
  name: z.string().optional().nullable(),
  picture: z.string().url().optional().nullable(),
});

export function validateClaims(
  raw: unknown
): Result<Claims, 'missing_claims' | 'invalid_claims' | 'email_unverified'> {
  if (!raw) return { ok: false, error: 'missing_claims' };
  const parsed = ClaimsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_claims' };
  if (parsed.data.email_verified === false) return { ok: false, error: 'email_unverified' };
  return { ok: true, data: parsed.data };
}
