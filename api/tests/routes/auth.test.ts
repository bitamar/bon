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
    const app = Fastify();
    await app.register(cookie, { secret: 's' });
    await app.register(errorPlugin);
    await app.register(authRoutes);
    const res = await app.inject({ method: 'GET', url: '/auth/google/callback?code=x&state=s' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body).toMatchObject({ error: 'missing_cookie' });
    expect(body).toHaveProperty('requestId');
    await app.close();
  });
});
