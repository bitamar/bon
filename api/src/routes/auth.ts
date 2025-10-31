import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { DrizzleUserRepository } from '../auth/repo.drizzle.js';
import { startGoogleAuth, finishGoogleAuth } from '../auth/service.js';
import { getGoogleOidcConfig } from '../auth/oidc.js';
import {
  OIDC_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
} from '../auth/constants.js';
import { createSession, deleteSession, getSession } from '../auth/session.js';
import { AppError, badRequest, unauthorized } from '../lib/app-error.js';
import { isHostAllowed, parseOriginHeader } from '../lib/origin.js';

export async function authRoutes(app: FastifyInstance) {
  const config = await getGoogleOidcConfig(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);

  app.get('/auth/google', async (req, reply) => {
    // Derive the initiating app origin from headers (prefer Origin, fallback to Referer).
    // If missing or not allowed, return 400 (no implicit fallbacks).
    let appOrigin: string | undefined;
    const { origin, referer } = req.headers;
    const candidate = typeof origin === 'string' && origin.length > 0 ? origin : referer;
    if (typeof candidate === 'string' && candidate.length > 0) {
      const parsed = parseOriginHeader(candidate);
      if (parsed && isHostAllowed(parsed.host, env.APP_ORIGIN_HOST)) {
        appOrigin = env.APP_ORIGIN;
      }
    }
    if (!appOrigin)
      throw badRequest({ code: 'invalid_origin', message: 'Origin is missing or not allowed' });

    const { cookie, redirectUrl } = startGoogleAuth(config, {
      redirectUri: env.OAUTH_REDIRECT_URI,
      appOrigin,
    });
    reply.setCookie(cookie.name, cookie.value, cookie.options);
    return reply.redirect(redirectUrl);
  });

  app.get('/auth/google/callback', async (req, reply) => {
    const repo = new DrizzleUserRepository();
    const result = await finishGoogleAuth(
      { config, repo, now: () => new Date(), redirectUri: env.OAUTH_REDIRECT_URI },
      { requestUrl: req.url, query: req.query, rawCookie: req.cookies['oidc'] }
    );

    // Clear temporary cookie regardless of outcome
    reply.clearCookie(OIDC_COOKIE_NAME, { path: '/' });

    if (!result.ok) {
      const isServer = result.error === 'oauth_exchange_failed';
      if (isServer) {
        req.log.error({ error: result.error }, 'google_callback_exchange_failed');
        throw new AppError({
          statusCode: 500,
          code: result.error,
          message: 'OAuth exchange failed',
          expose: false,
        });
      }
      const status = result.error === 'email_unverified' ? 403 : 400;
      req.log.debug({ error: result.error }, 'google_callback_client_error');
      throw new AppError({
        statusCode: status,
        code: result.error,
        message: result.error,
      });
    }

    // Create session and set cookie
    const session = await createSession(result.data.user);
    reply.setCookie(SESSION_COOKIE_NAME, session.id, SESSION_COOKIE_OPTIONS);

    // On success, redirect back to the SPA (dashboard)
    const parsedOrigin = parseOriginHeader(result.data.appOrigin);
    if (!parsedOrigin || !isHostAllowed(parsedOrigin.host, env.APP_ORIGIN_HOST)) {
      throw badRequest({ code: 'invalid_origin', message: 'Origin is missing or not allowed' });
    }
    return reply.redirect(`${env.APP_ORIGIN}/`);
  });

  // Return current user from session
  app.get('/me', async (req, reply) => {
    const sessionId = req.cookies[SESSION_COOKIE_NAME];
    const session = await getSession(sessionId);
    if (!session) throw unauthorized();
    return reply.send({ user: session.user });
  });

  // Logout: delete session and clear cookie
  app.post('/auth/logout', async (req, reply) => {
    const sessionId = req.cookies[SESSION_COOKIE_NAME];
    await deleteSession(sessionId);
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return reply.send({ ok: true });
  });
}
