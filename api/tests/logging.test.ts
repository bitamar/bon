import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/app.js';
import { SESSION_COOKIE_NAME } from '../src/auth/constants.js';
import * as sessionModule from '../src/auth/session.js';

vi.mock('openid-client', () => ({
  discovery: vi.fn().mockResolvedValue({}),
  ClientSecretPost: (secret: string) => ({ secret }),
}));

describe('logging plugin', () => {
  let app: FastifyInstance | undefined;

  beforeEach(async () => {
    app = await buildServer({ logger: { level: 'silent' } });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('attaches header request id to the request logger bindings', async () => {
    const server = app;
    if (!server) throw new Error('server not initialised');

    server.get('/test/request', async (request, reply) => {
      const logger = request.log as typeof request.log & {
        bindings?: () => Record<string, unknown>;
      };
      const bindings = typeof logger.bindings === 'function' ? (logger.bindings() ?? {}) : {};
      return reply.send(bindings);
    });

    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: '/test/request',
      headers: {
        'x-request-id': 'req-123',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body.requestId).toBe('req-123');
  });

  it('adds authenticated user context to the logger', async () => {
    const server = app;
    if (!server) throw new Error('server not initialised');

    const now = new Date();
    const user = {
      id: 'user-123',
      email: 'user@example.com',
      googleId: null,
      name: 'Test User',
      avatarUrl: null,
      phone: null,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    };

    vi.spyOn(sessionModule, 'getSession').mockResolvedValue({
      id: 'session-abc',
      user,
      createdAt: now,
      lastAccessedAt: now,
    });

    server.get(
      '/test/authenticated',
      { preHandler: server.authenticate },
      async (request, reply) => {
        const logger = request.log as typeof request.log & {
          bindings?: () => Record<string, unknown>;
        };
        const bindings = typeof logger.bindings === 'function' ? (logger.bindings() ?? {}) : {};
        return reply.send(bindings);
      }
    );

    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: '/test/authenticated',
      headers: {
        'x-request-id': 'req-456',
      },
      cookies: {
        [SESSION_COOKIE_NAME]: 'session-abc',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body.requestId).toBe('req-456');
    expect(body.userId).toBe(user.id);
    expect(body.sessionId).toBe('session-abc');
  });
});
