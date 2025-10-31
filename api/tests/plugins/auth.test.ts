import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { authPlugin, ensureAuthed } from '../../src/plugins/auth.js';
import { SESSION_COOKIE_NAME } from '../../src/auth/constants.js';

const getSessionMock = vi.fn();

vi.mock('../../src/auth/session.js', () => ({
  getSession: (...args: unknown[]) => getSessionMock(...args),
}));

describe('authPlugin', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('authenticates requests and decorates request object', async () => {
    const now = new Date();
    getSessionMock.mockResolvedValue({
      id: 'session-1',
      user: {
        id: 'user-1',
        email: 'user@example.com',
        googleId: 'gid',
        name: 'Test User',
        avatarUrl: null,
        phone: null,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      },
      createdAt: now,
      lastAccessedAt: now,
    });

    const app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'secret' });
    await app.register(authPlugin);

    app.get('/test', { preHandler: app.authenticate }, async (request) => ({
      userId: request.user?.id,
      sessionId: request.sessionId,
    }));

    const res = await app.inject({
      method: 'GET',
      url: '/test',
      cookies: { [SESSION_COOKIE_NAME]: 'session-1' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: 'user-1', sessionId: 'session-1' });
    expect(getSessionMock).toHaveBeenCalledWith('session-1');

    await app.close();
  });

  it('rejects requests without a valid session', async () => {
    getSessionMock.mockResolvedValue(undefined);

    const app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'secret' });
    await app.register(authPlugin);

    app.get('/test', { preHandler: app.authenticate }, async () => ({ ok: true }));

    const res = await app.inject({ method: 'GET', url: '/test' });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: expect.stringMatching(/unauthorized/i) });

    await app.close();
  });

  it('ensureAuthed throws when user is missing', () => {
    expect(() => ensureAuthed({} as never)).toThrowError(/unauthorized/i);
  });
});
