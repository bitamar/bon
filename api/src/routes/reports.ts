import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { businessIdParamSchema } from '@bon/types/businesses';
import { uniformFileQuerySchema } from '@bon/types/reports';
import { ensureBusinessContext } from '../plugins/business-context.js';
import { generateBkmvExport } from '../services/bkmv-service.js';
import { createZip } from '../lib/zip.js';

const reportRoutesPlugin: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/businesses/:businessId/reports/uniform-file',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        tags: ['Reports'],
        params: businessIdParamSchema,
        querystring: uniformFileQuerySchema,
      },
    },
    async (req, reply) => {
      ensureBusinessContext(req);
      const { year } = req.query;
      const result = await generateBkmvExport(req.businessContext.businessId, year);

      const zipBuffer = await createZip({
        'INI.TXT': result.iniContent,
        'BKMVDATA.TXT': result.bkmvdataContent,
        'README.TXT': result.readmeContent,
      });

      const safeFilename = result.filename.replaceAll(/[^\w.-]/g, '_');
      return reply
        .type('application/zip')
        .header('Content-Disposition', `attachment; filename="${safeFilename}"`)
        .send(zipBuffer);
    }
  );
};

export const reportRoutes = reportRoutesPlugin;
