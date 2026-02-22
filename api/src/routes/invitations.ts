import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ensureAuthed } from '../plugins/auth.js';
import { ensureBusinessContext } from '../plugins/business-context.js';
import {
  createInvitationBodySchema,
  invitationListResponseSchema,
  myInvitationsResponseSchema,
  invitationTokenParamSchema,
} from '@bon/types/invitations';
import { businessIdParamSchema } from '@bon/types/businesses';
import { okResponseSchema } from '@bon/types/common';
import {
  createInvitation,
  listInvitations,
  getMyInvitations,
  acceptInvitation,
  declineInvitation,
} from '../services/invitation-service.js';

const invitationRoutesPlugin: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/businesses/:businessId/invitations',
    {
      preHandler: [
        app.authenticate,
        app.requireBusinessAccess,
        app.requireBusinessRole('owner', 'admin'),
      ],
      schema: {
        params: businessIdParamSchema,
        body: createInvitationBodySchema,
        response: {
          201: okResponseSchema,
        },
      },
    },
    async (req, reply) => {
      ensureAuthed(req);
      ensureBusinessContext(req);
      await createInvitation(req.businessContext.businessId, req.user.id, req.body);
      return reply.status(201).send({ ok: true as const });
    }
  );

  app.get(
    '/businesses/:businessId/invitations',
    {
      preHandler: [
        app.authenticate,
        app.requireBusinessAccess,
        app.requireBusinessRole('owner', 'admin'),
      ],
      schema: {
        params: businessIdParamSchema,
        response: {
          200: invitationListResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      return listInvitations(req.businessContext.businessId);
    }
  );

  app.get(
    '/invitations/mine',
    {
      preHandler: app.authenticate,
      schema: {
        response: {
          200: myInvitationsResponseSchema,
        },
      },
    },
    async (req) => {
      ensureAuthed(req);
      return getMyInvitations(req.user.email);
    }
  );

  app.post(
    '/invitations/:token/accept',
    {
      preHandler: app.authenticate,
      schema: {
        params: invitationTokenParamSchema,
        response: {
          200: okResponseSchema,
        },
      },
    },
    async (req) => {
      ensureAuthed(req);
      await acceptInvitation(req.params.token, req.user.id, req.user.email);
      return { ok: true as const };
    }
  );

  app.post(
    '/invitations/:token/decline',
    {
      preHandler: app.authenticate,
      schema: {
        params: invitationTokenParamSchema,
        response: {
          200: okResponseSchema,
        },
      },
    },
    async (req) => {
      ensureAuthed(req);
      await declineInvitation(req.params.token, req.user.id, req.user.email);
      return { ok: true as const };
    }
  );
};

export const invitationRoutes = invitationRoutesPlugin;
