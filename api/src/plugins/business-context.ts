import type {
  FastifyPluginAsync,
  preHandlerHookHandler,
  FastifyRequest,
  RouteGenericInterface,
} from 'fastify';
import fp from 'fastify-plugin';
import { findUserBusiness } from '../repositories/user-business-repository.js';
import { notFound } from '../lib/app-error.js';
import { ensureAuthed } from './auth.js';

export type BusinessRole = 'owner' | 'admin' | 'user';

export interface BusinessContext {
  businessId: string;
  role: BusinessRole;
}

declare module 'fastify' {
  interface FastifyRequest {
    businessContext?: BusinessContext;
  }
  interface FastifyInstance {
    requireBusinessAccess: preHandlerHookHandler;
    requireBusinessRole: (...roles: BusinessRole[]) => preHandlerHookHandler;
  }
}

const businessContextPluginFn: FastifyPluginAsync = async (app) => {
  app.decorate('requireBusinessAccess', async (req, _reply) => {
    ensureAuthed(req);

    const businessId = (req.params as { businessId?: string }).businessId;
    if (!businessId) {
      throw notFound({ message: 'Business not found' });
    }

    const userBusiness = await findUserBusiness(req.user.id, businessId);
    if (!userBusiness) {
      throw notFound({ message: 'Business not found' });
    }

    req.businessContext = {
      businessId,
      role: userBusiness.role,
    };

    req.log = req.log.child({
      businessId,
      businessRole: userBusiness.role,
    });
  });

  app.decorate('requireBusinessRole', (...allowedRoles: BusinessRole[]) => {
    const handler: preHandlerHookHandler = async (req, _reply) => {
      ensureAuthed(req);

      if (!req.businessContext) {
        throw notFound({ message: 'Business not found' });
      }

      if (!allowedRoles.includes(req.businessContext.role)) {
        throw notFound({ message: 'Business not found' });
      }
    };
    return handler;
  });
};

export const businessContextPlugin = fp(businessContextPluginFn);

export type BusinessContextRequest<T extends RouteGenericInterface = RouteGenericInterface> =
  FastifyRequest<T> & {
    businessContext: BusinessContext;
  };

export function ensureBusinessContext<T extends RouteGenericInterface>(
  req: FastifyRequest<T>
): asserts req is BusinessContextRequest<T> {
  if (!req.businessContext) throw notFound({ message: 'Business not found' });
}
