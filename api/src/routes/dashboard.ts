import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ensureBusinessContext } from '../plugins/business-context.js';
import { businessIdParamSchema } from '@bon/types/businesses';
import { dashboardResponseSchema } from '@bon/types/dashboard';
import { getDashboardData } from '../services/dashboard-service.js';

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
    async (req) => {
      ensureBusinessContext(req);
      return getDashboardData(req.businessContext.businessId);
    }
  );
};

export const dashboardRoutes = dashboardRoutesPlugin;
