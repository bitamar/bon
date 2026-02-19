import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { authRoutes } from '../../src/routes/auth.js';
import { errorPlugin } from '../../src/plugins/errors.js';

vi.mock('openid-client', () => ({
  discovery: vi.fn().mockResolvedValue({}),
  ClientSecretPost: (secret: string) => ({ secret }),
  randomState: () => 'state',
  randomNonce: () => 'nonce',
  buildAuthorizationUrl: (
    _config: unknown,
    params: { state: string; nonce: string; redirect_uri: string }
  ) => {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('state', params.state);
    url.searchParams.set('nonce', params.nonce);
    url.searchParams.set('redirect_uri', params.redirect_uri);
    return url;
  },
  authorizationCodeGrant: vi.fn(),
}));

vi.mock('../../src/auth/service.js', () => ({
  startGoogleAuth: vi.fn(() => ({
    cookie: { name: 'oidc', value: 'test-oidc-value', options: { path: '/' } },
    redirectUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=state',
  })),
  finishGoogleAuth: vi.fn(),
}));

vi.mock('../../src/auth/session.js', () => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  deleteSession: vi.fn(),
}));

async function buildApp() {
  const app = Fastify();
  await app.register(cookie, { secret: 's' });
  await app.register(errorPlugin);
  await app.register(authRoutes);
  return app;
}

describe('routes/auth', () => {
  it('GET /auth/google redirects and sets cookie', async () => {
    const app = Fastify();
    await app.register(cookie, { secret: 's' });
    await app.register(errorPlugin);
    await app.register(authRoutes);
    const res = await app.inject({
      method: 'GET',
      url: '/auth/google',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers['set-cookie']).toBeTruthy();
    expect(res.headers.location).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    await app.close();
  });

  it('GET /auth/google/callback without cookie returns 400', async () => {
    const { finishGoogleAuth } = await import('../../src/auth/service.js');
    vi.mocked(finishGoogleAuth).mockResolvedValueOnce({ ok: false, error: 'missing_cookie' });

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/auth/google/callback?code=x&state=s' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body).toMatchObject({ error: 'missing_cookie' });
    expect(body).toHaveProperty('requestId');
    await app.close();
  });

  describe('GET /auth/google — origin validation', () => {
    it('returns 400 when Origin header is missing', async () => {
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/auth/google' });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'invalid_origin' });
      await app.close();
    });

    it('returns 400 when Origin header has a disallowed host', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/auth/google',
        headers: { origin: 'http://evil.example.com' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'invalid_origin' });
      await app.close();
    });
  });

  describe('GET /auth/google/callback — finishGoogleAuth failure paths', () => {
    it('returns 500 when finishGoogleAuth returns oauth_exchange_failed', async () => {
      const { finishGoogleAuth } = await import('../../src/auth/service.js');
      vi.mocked(finishGoogleAuth).mockResolvedValueOnce({
        ok: false,
        error: 'oauth_exchange_failed',
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/auth/google/callback?code=x&state=s',
      });
      expect(res.statusCode).toBe(500);
      await app.close();
    });

    it('returns 403 when finishGoogleAuth returns email_unverified', async () => {
      const { finishGoogleAuth } = await import('../../src/auth/service.js');
      vi.mocked(finishGoogleAuth).mockResolvedValueOnce({
        ok: false,
        error: 'email_unverified',
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/auth/google/callback?code=x&state=s',
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: 'email_unverified' });
      await app.close();
    });

    it('returns 400 when finishGoogleAuth returns state_mismatch', async () => {
      const { finishGoogleAuth } = await import('../../src/auth/service.js');
      vi.mocked(finishGoogleAuth).mockResolvedValueOnce({
        ok: false,
        error: 'state_mismatch',
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/auth/google/callback?code=x&state=s',
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'state_mismatch' });
      await app.close();
    });

    it('redirects to APP_ORIGIN on success', async () => {
      const { finishGoogleAuth } = await import('../../src/auth/service.js');
      const { createSession } = await import('../../src/auth/session.js');

      const fakeUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        avatarUrl: null,
        phone: null,
        googleId: 'google-user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(finishGoogleAuth).mockResolvedValueOnce({
        ok: true,
        data: { user: fakeUser, appOrigin: 'http://localhost:5173' },
      });

      vi.mocked(createSession).mockResolvedValueOnce({
        id: 'session-abc',
        user: fakeUser,
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/auth/google/callback?code=x&state=s',
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/');
      const setCookie = res.headers['set-cookie'];
      const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie ?? '');
      expect(cookieStr).toMatch(/session=/);
      await app.close();
    });
  });

  describe('GET /me', () => {
    it('returns 401 when no session cookie is present', async () => {
      const { getSession } = await import('../../src/auth/session.js');
      vi.mocked(getSession).mockResolvedValueOnce(undefined);

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/me' });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it('returns user when valid session cookie exists', async () => {
      const { getSession } = await import('../../src/auth/session.js');

      const fakeUser = {
        id: 'user-2',
        email: 'hello@example.com',
        name: 'Hello User',
        avatarUrl: null,
        phone: null,
        googleId: 'google-user-2',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(getSession).mockResolvedValueOnce({
        id: 'session-xyz',
        user: fakeUser,
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/me',
        cookies: { session: 'session-xyz' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user).toMatchObject({ id: 'user-2', email: 'hello@example.com' });
      await app.close();
    });
  });

  describe('POST /auth/logout', () => {
    it('clears session cookie and returns ok: true', async () => {
      const { deleteSession } = await import('../../src/auth/session.js');
      vi.mocked(deleteSession).mockResolvedValueOnce(undefined);

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        cookies: { session: 'session-to-delete' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      // Cookie should be cleared (set with empty value / expires in past)
      const setCookie = res.headers['set-cookie'];
      expect(Array.isArray(setCookie) ? setCookie.join('') : setCookie).toContain('session=');
      await app.close();
    });
  });
});
