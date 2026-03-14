import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { businessIdParamSchema } from '@bon/types/businesses';
import { pcn874QuerySchema } from '@bon/types/pcn874';
import { generatePcn874 } from '../services/pcn874-service.js';

const pcn874RoutesPlugin: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/businesses/:businessId/reports/pcn874',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        tags: ['Reports'],
        params: businessIdParamSchema,
        querystring: pcn874QuerySchema,
      },
    },
    async (request, reply) => {
      const { businessId } = request.params;
      const { year, month } = request.query;
      const { buffer, filename } = await generatePcn874(businessId, year, month);

      return reply
        .header('Content-Type', 'text/plain; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(buffer);
    }
  );
};

export const pcn874Routes = pcn874RoutesPlugin;
