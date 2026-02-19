import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { SESSION_COOKIE_NAME } from '../../src/auth/constants.js';

const getSessionMock = vi.fn();

vi.mock('../../src/auth/session.js', () => ({
  getSession: (...args: unknown[]) => getSessionMock(...args),
}));

const fakeUser = {
  id: 'user-unit-1',
  email: 'unit@example.com',
  googleId: 'gid',
  name: 'Unit User',
  avatarUrl: null,
  phone: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastLoginAt: new Date(),
};

describe('plugins/business-context (defensive branches)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getSessionMock.mockResolvedValue({
      id: 'session-unit-1',
      user: fakeUser,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    });
  });

  it('requireBusinessAccess returns 404 when route has no businessId param', async () => {
    const { authPlugin } = await import('../../src/plugins/auth.js');
    const { businessContextPlugin } = await import('../../src/plugins/business-context.js');
    const { errorPlugin } = await import('../../src/plugins/errors.js');

    const app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'secret' });
    await app.register(authPlugin);
    await app.register(businessContextPlugin);
    await app.register(errorPlugin);

    // Route without a :businessId param — params.businessId will be undefined,
    // hitting the `if (!businessId)` branch at line 34-36 of business-context.ts.
    // app.authenticate is required to populate req.user before requireBusinessAccess runs.
    app.get(
      '/no-business-param',
      { preHandler: [app.authenticate, app.requireBusinessAccess] },
      async () => ({ ok: true })
    );

    const res = await app.inject({
      method: 'GET',
      url: '/no-business-param',
      cookies: { [SESSION_COOKIE_NAME]: 'session-unit-1' },
    });

    expect(res.statusCode).toBe(404);
    expect((res.json() as Record<string, unknown>)['error']).toBe('not_found');

    await app.close();
  });

  it('requireBusinessRole returns 404 when businessContext has not been set', async () => {
    const { authPlugin } = await import('../../src/plugins/auth.js');
    const { businessContextPlugin } = await import('../../src/plugins/business-context.js');
    const { errorPlugin } = await import('../../src/plugins/errors.js');

    const app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'secret' });
    await app.register(authPlugin);
    await app.register(businessContextPlugin);
    await app.register(errorPlugin);

    // Route that uses requireBusinessRole directly without first running requireBusinessAccess,
    // so req.businessContext is undefined — hitting the `if (!req.businessContext)` branch
    // at line 58-60 of business-context.ts.
    // app.authenticate is required to populate req.user before requireBusinessRole runs.
    app.get(
      '/role-without-context',
      { preHandler: [app.authenticate, app.requireBusinessRole('owner')] },
      async () => ({ ok: true })
    );

    const res = await app.inject({
      method: 'GET',
      url: '/role-without-context',
      cookies: { [SESSION_COOKIE_NAME]: 'session-unit-1' },
    });

    expect(res.statusCode).toBe(404);
    expect((res.json() as Record<string, unknown>)['error']).toBe('not_found');

    await app.close();
  });
});
