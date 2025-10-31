import type {
  FastifyPluginAsync,
  preHandlerHookHandler,
  FastifyRequest,
  RouteGenericInterface,
} from 'fastify';
import fp from 'fastify-plugin';
import { getSession } from '../auth/session.js';
import { SESSION_COOKIE_NAME } from '../auth/constants.js';
import type { DbUser } from '../auth/types.js';
import { unauthorized } from '../lib/app-error.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: DbUser;
    sessionId?: string;
  }
  interface FastifyInstance {
    authenticate: preHandlerHookHandler;
  }
}

const authPluginFn: FastifyPluginAsync = async (app) => {
  app.decorate('authenticate', async (req, _reply) => {
    const sessionId = req.cookies[SESSION_COOKIE_NAME];
    const session = await getSession(sessionId);
    if (!session) throw unauthorized();

    req.user = session.user;
    req.sessionId = session.id;
    req.log = req.log.child({
      userId: session.user.id,
      sessionId: session.id,
    });
    req.log.debug({ userId: session.user.id, sessionId: session.id }, 'request_authenticated');
  });
};

export const authPlugin = fp(authPluginFn);

export type AuthenticatedRequest<T extends RouteGenericInterface = RouteGenericInterface> =
  FastifyRequest<T> & {
    user: DbUser;
    sessionId: string;
  };

export function ensureAuthed<T extends RouteGenericInterface>(
  req: FastifyRequest<T>
): asserts req is AuthenticatedRequest<T> {
  if (!('user' in req) || !req.user) throw unauthorized();
}
