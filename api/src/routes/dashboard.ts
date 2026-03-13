import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { businessIdParamSchema } from '@bon/types/businesses';
import { dashboardResponseSchema } from '@bon/types/dashboard';
import { getDashboard } from '../services/dashboard-service.js';

const dashboardRoutesPlugin: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/businesses/:businessId/dashboard',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        tags: ['Dashboard'],
        params: businessIdParamSchema,
        response: {
          200: dashboardResponseSchema,
        },
      },
    },
    async (request) => {
      const { businessId } = request.params;
      return getDashboard(businessId);
    }
  );
};

export const dashboardRoutes = dashboardRoutesPlugin;
