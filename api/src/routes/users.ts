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
        tags: ['Users'],
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
        whatsappEnabled: req.user.whatsappEnabled,
      });
    }
  );

  app.patch(
    '/settings',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Users'],
        body: updateSettingsBodySchema,
        response: {
          200: settingsResponseSchema,
        },
      },
    },
    async (req) => {
      ensureAuthed(req);
      const { name, phone, whatsappEnabled } = req.body;
      return updateSettingsForUser(req.user.id, {
        name: name ?? null,
        phone: phone ?? null,
        whatsappEnabled,
      });
    }
  );
};

export const userRoutes = userRoutesPlugin;
