import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ensureBusinessContext } from '../plugins/business-context.js';
import {
  createInvoiceDraftBodySchema,
  updateInvoiceDraftBodySchema,
  finalizeInvoiceBodySchema,
  invoiceResponseSchema,
  invoiceIdParamSchema,
} from '@bon/types/invoices';
import { businessIdParamSchema } from '@bon/types/businesses';
import { okResponseSchema } from '@bon/types/common';
import {
  createDraft,
  getInvoice,
  updateDraft,
  deleteDraft,
  finalize,
} from '../services/invoice-service.js';

const invoiceRoutesPlugin: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/businesses/:businessId/invoices',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        params: businessIdParamSchema,
        body: createInvoiceDraftBodySchema,
        response: {
          201: invoiceResponseSchema,
        },
      },
    },
    async (req, reply) => {
      ensureBusinessContext(req);
      const result = await createDraft(req.businessContext.businessId, req.body);
      return reply.status(201).send(result);
    }
  );

  app.get(
    '/businesses/:businessId/invoices/:invoiceId',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        params: invoiceIdParamSchema,
        response: {
          200: invoiceResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      return getInvoice(req.businessContext.businessId, req.params.invoiceId);
    }
  );

  app.patch(
    '/businesses/:businessId/invoices/:invoiceId',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        params: invoiceIdParamSchema,
        body: updateInvoiceDraftBodySchema,
        response: {
          200: invoiceResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      return updateDraft(req.businessContext.businessId, req.params.invoiceId, req.body);
    }
  );

  app.delete(
    '/businesses/:businessId/invoices/:invoiceId',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        params: invoiceIdParamSchema,
        response: {
          200: okResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      await deleteDraft(req.businessContext.businessId, req.params.invoiceId);
      return { ok: true as const };
    }
  );

  app.post(
    '/businesses/:businessId/invoices/:invoiceId/finalize',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        params: invoiceIdParamSchema,
        body: finalizeInvoiceBodySchema,
        response: {
          200: invoiceResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      return finalize(req.businessContext.businessId, req.params.invoiceId, req.body);
    }
  );
};

export const invoiceRoutes = invoiceRoutesPlugin;
