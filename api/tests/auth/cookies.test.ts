import { describe, it, expect } from 'vitest';
import { parseOidcCookie, serializeOidcCookie, verifyStateMatch } from '../../src/auth/cookies.js';

describe('cookies', () => {
  it('serializes and parses oidc cookie', () => {
    const raw = serializeOidcCookie({ state: 's', nonce: 'n', appOrigin: 'http://localhost:5173' });
    const parsed = parseOidcCookie(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.state).toBe('s');
      expect(parsed.data.nonce).toBe('n');
      expect(parsed.data.appOrigin).toBe('http://localhost:5173');
    }
  });

  it('handles missing cookie', () => {
    const res = parseOidcCookie(undefined);
    expect(res).toEqual({ ok: false, error: 'missing_cookie' });
  });

  it('handles bad cookie json', () => {
    const res = parseOidcCookie('{bad');
    expect(res).toEqual({ ok: false, error: 'bad_cookie' });
  });

  it('handles bad cookie shape', () => {
    const res = parseOidcCookie(JSON.stringify({ state: '' }));
    expect(res).toEqual({ ok: false, error: 'bad_cookie' });
  });

  it('verifies state match', () => {
    expect(verifyStateMatch('a', 'a')).toEqual({ ok: true, data: true });
    expect(verifyStateMatch('a', 'b')).toEqual({ ok: false, error: 'state_mismatch' });
  });
});
