import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ensureBusinessContext } from '../plugins/business-context.js';
import {
  createCustomerBodySchema,
  updateCustomerBodySchema,
  customerResponseSchema,
  customerListResponseSchema,
  customerParamSchema,
  customerIdParamSchema,
  customerQuerySchema,
} from '@bon/types/customers';
import { okResponseSchema } from '@bon/types/common';
import {
  createCustomer,
  getCustomerById,
  updateCustomerById,
  listCustomers,
} from '../services/customer-service.js';

const customerRoutesPlugin: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/businesses/:businessId/customers',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        params: customerParamSchema,
        querystring: customerQuerySchema,
        response: {
          200: customerListResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      const { q, active, limit } = req.query;
      const activeOnly = active !== 'false';
      return listCustomers(req.businessContext.businessId, q, activeOnly, limit ?? 50);
    }
  );

  app.post(
    '/businesses/:businessId/customers',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        params: customerParamSchema,
        body: createCustomerBodySchema,
        response: {
          200: customerResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      return createCustomer(req.businessContext.businessId, req.body);
    }
  );

  app.get(
    '/businesses/:businessId/customers/:customerId',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        params: customerIdParamSchema,
        response: {
          200: customerResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      return getCustomerById(req.businessContext.businessId, req.params.customerId);
    }
  );

  app.put(
    '/businesses/:businessId/customers/:customerId',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        params: customerIdParamSchema,
        body: updateCustomerBodySchema,
        response: {
          200: customerResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      return updateCustomerById(req.businessContext.businessId, req.params.customerId, req.body);
    }
  );

  app.delete(
    '/businesses/:businessId/customers/:customerId',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        params: customerIdParamSchema,
        response: {
          200: okResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      await updateCustomerById(req.businessContext.businessId, req.params.customerId, {
        isActive: false,
      });
      return { ok: true as const };
    }
  );
};

export const customerRoutes = customerRoutesPlugin;
