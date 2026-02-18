import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ensureAuthed } from '../plugins/auth.js';
import { ensureBusinessContext } from '../plugins/business-context.js';
import {
  businessResponseSchema,
  businessListResponseSchema,
  createBusinessBodySchema,
  updateBusinessBodySchema,
  businessIdParamSchema,
  teamListResponseSchema,
  teamMemberParamSchema,
} from '@bon/types/businesses';
import { okResponseSchema } from '@bon/types/common';
import {
  createBusiness,
  getBusinessById,
  updateBusinessById,
  listBusinessesForUser,
  listTeamMembers,
  removeTeamMember,
} from '../services/business-service.js';

const businessRoutesPlugin: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/businesses',
    {
      preHandler: app.authenticate,
      schema: {
        body: createBusinessBodySchema,
        response: {
          200: businessResponseSchema,
        },
      },
    },
    async (req) => {
      ensureAuthed(req);
      return createBusiness(req.user.id, req.body);
    }
  );

  app.get(
    '/businesses',
    {
      preHandler: app.authenticate,
      schema: {
        response: {
          200: businessListResponseSchema,
        },
      },
    },
    async (req) => {
      ensureAuthed(req);
      return listBusinessesForUser(req.user.id);
    }
  );

  app.get(
    '/businesses/:businessId',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        params: businessIdParamSchema,
        response: {
          200: businessResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      return getBusinessById(req.businessContext.businessId, req.businessContext.role);
    }
  );

  app.put(
    '/businesses/:businessId',
    {
      preHandler: [
        app.authenticate,
        app.requireBusinessAccess,
        app.requireBusinessRole('owner', 'admin'),
      ],
      schema: {
        params: businessIdParamSchema,
        body: updateBusinessBodySchema,
        response: {
          200: businessResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      return updateBusinessById(req.businessContext.businessId, req.businessContext.role, req.body);
    }
  );

  app.get(
    '/businesses/:businessId/team',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        params: businessIdParamSchema,
        response: {
          200: teamListResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      return listTeamMembers(req.businessContext.businessId);
    }
  );

  app.delete(
    '/businesses/:businessId/team/:userId',
    {
      preHandler: [
        app.authenticate,
        app.requireBusinessAccess,
        app.requireBusinessRole('owner', 'admin'),
      ],
      schema: {
        params: teamMemberParamSchema,
        response: {
          200: okResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      await removeTeamMember(
        req.businessContext.businessId,
        req.params.userId,
        req.businessContext.role
      );
      return { ok: true as const };
    }
  );
};

export const businessRoutes = businessRoutesPlugin;
