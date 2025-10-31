import { describe, it, expect } from 'vitest';
import { validateCallbackQuery, validateClaims } from '../../src/auth/validation.js';

describe('validation', () => {
  it('validates callback query', () => {
    const ok = validateCallbackQuery({ code: 'c', state: 's' });
    expect(ok.ok).toBe(true);
    const bad = validateCallbackQuery({});
    expect(bad).toEqual({ ok: false, error: 'invalid_query' });
  });

  it('validates claims and email_verified', () => {
    expect(validateClaims(undefined)).toEqual({ ok: false, error: 'missing_claims' });
    expect(
      validateClaims({
        sub: '1',
        email: 'e@example.com',
        name: null,
        picture: null,
        email_verified: true,
      })
    ).toEqual({
      ok: true,
      data: { sub: '1', email: 'e@example.com', name: null, picture: null, email_verified: true },
    });
    expect(
      validateClaims({
        sub: '1',
        email: 'e@example.com',
        name: null,
        picture: null,
        email_verified: false,
      })
    ).toEqual({ ok: false, error: 'email_unverified' });
  });
});
