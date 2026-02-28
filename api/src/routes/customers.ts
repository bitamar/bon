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
  deactivateCustomer,
  reactivateCustomer,
} from '../services/customer-service.js';

const customerRoutesPlugin: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/businesses/:businessId/customers',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        tags: ['Customers'],
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
        tags: ['Customers'],
        params: customerParamSchema,
        body: createCustomerBodySchema,
        response: {
          201: customerResponseSchema,
        },
      },
    },
    async (req, reply) => {
      ensureBusinessContext(req);
      const result = await createCustomer(req.businessContext.businessId, req.body);
      return reply.status(201).send(result);
    }
  );

  app.get(
    '/businesses/:businessId/customers/:customerId',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        tags: ['Customers'],
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

  app.patch(
    '/businesses/:businessId/customers/:customerId',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        tags: ['Customers'],
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
      preHandler: [
        app.authenticate,
        app.requireBusinessAccess,
        app.requireBusinessRole('owner', 'admin'),
      ],
      schema: {
        tags: ['Customers'],
        params: customerIdParamSchema,
        response: {
          200: okResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      await deactivateCustomer(req.businessContext.businessId, req.params.customerId);
      return { ok: true as const };
    }
  );

  app.post(
    '/businesses/:businessId/customers/:customerId/deactivate',
    {
      preHandler: [
        app.authenticate,
        app.requireBusinessAccess,
        app.requireBusinessRole('owner', 'admin'),
      ],
      schema: {
        tags: ['Customers'],
        params: customerIdParamSchema,
        response: {
          200: customerResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      return deactivateCustomer(req.businessContext.businessId, req.params.customerId);
    }
  );

  app.post(
    '/businesses/:businessId/customers/:customerId/reactivate',
    {
      preHandler: [
        app.authenticate,
        app.requireBusinessAccess,
        app.requireBusinessRole('owner', 'admin'),
      ],
      schema: {
        tags: ['Customers'],
        params: customerIdParamSchema,
        response: {
          200: customerResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      return reactivateCustomer(req.businessContext.businessId, req.params.customerId);
    }
  );
};

export const customerRoutes = customerRoutesPlugin;
