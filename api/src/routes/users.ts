import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ensureAuthed } from '../plugins/auth.js';
import { settingsResponseSchema, updateSettingsBodySchema } from '@bon/types/users';
import { getSettingsFromUser, updateSettingsForUser } from '../services/user-service.js';

const userRoutesPlugin: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/settings',
    {
      preHandler: app.authenticate,
      schema: {
        response: {
          200: settingsResponseSchema,
        },
      },
    },
    async (req) => {
      ensureAuthed(req);
      return getSettingsFromUser({
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        avatarUrl: req.user.avatarUrl,
        phone: req.user.phone,
      });
    }
  );

  app.put(
    '/settings',
    {
      preHandler: app.authenticate,
      schema: {
        body: updateSettingsBodySchema,
        response: {
          200: settingsResponseSchema,
        },
      },
    },
    async (req) => {
      ensureAuthed(req);
      const { name, phone } = req.body;
      return updateSettingsForUser(req.user.id, { name: name ?? null, phone: phone ?? null });
    }
  );
};

export const userRoutes = userRoutesPlugin;
