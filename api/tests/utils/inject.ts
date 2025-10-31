import type { FastifyInstance, InjectOptions } from 'fastify';
import { SESSION_COOKIE_NAME } from '../../src/auth/constants.js';

export function injectAuthed(app: FastifyInstance, sessionId: string, options: InjectOptions) {
  const cookieHeader = `${SESSION_COOKIE_NAME}=${sessionId}`;
  return app.inject({
    ...options,
    headers: {
      ...(options.headers ?? {}),
      cookie: options.headers?.cookie ? `${options.headers.cookie}; ${cookieHeader}` : cookieHeader,
    },
    cookies: {
      ...(options as { cookies?: Record<string, string> }).cookies,
      [SESSION_COOKIE_NAME]: sessionId,
    },
  });
}
