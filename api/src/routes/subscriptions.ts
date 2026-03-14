import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ensureBusinessContext } from '../plugins/business-context.js';
import { businessIdParamSchema } from '@bon/types/businesses';
import { okResponseSchema } from '@bon/types/common';
import {
  subscriptionResponseSchema,
  createCheckoutBodySchema,
  checkoutResponseSchema,
  meshulamWebhookSchema,
} from '@bon/types/subscriptions';
import {
  getSubscriptionStatus,
  createCheckoutSession,
  handlePaymentWebhook,
  cancelSubscription,
  startTrial,
} from '../services/subscription-service.js';

const subscriptionRoutesPlugin: FastifyPluginAsyncZod = async (app) => {
  // Get subscription status for a business
  app.get(
    '/businesses/:businessId/subscription',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        tags: ['Subscriptions'],
        params: businessIdParamSchema,
        response: {
          200: subscriptionResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      return getSubscriptionStatus(req.businessContext.businessId);
    }
  );

  // Start a free trial
  app.post(
    '/businesses/:businessId/subscription/trial',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        tags: ['Subscriptions'],
        params: businessIdParamSchema,
        response: {
          201: subscriptionResponseSchema,
        },
      },
    },
    async (req, reply) => {
      ensureBusinessContext(req);
      const result = await startTrial(req.businessContext.businessId);
      return reply.status(201).send({
        subscription: result.subscription,
        canCreateInvoices: true,
        daysRemaining: 14,
      });
    }
  );

  // Create a checkout session with Meshulam
  app.post(
    '/businesses/:businessId/subscription/checkout',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        tags: ['Subscriptions'],
        params: businessIdParamSchema,
        body: createCheckoutBodySchema,
        response: {
          200: checkoutResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      return createCheckoutSession(
        req.businessContext.businessId,
        req.body.plan,
        req.body.successUrl,
        req.body.cancelUrl
      );
    }
  );

  // Cancel subscription
  app.post(
    '/businesses/:businessId/subscription/cancel',
    {
      preHandler: [
        app.authenticate,
        app.requireBusinessAccess,
        app.requireBusinessRole('owner', 'admin'),
      ],
      schema: {
        tags: ['Subscriptions'],
        params: businessIdParamSchema,
        response: {
          200: okResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      return cancelSubscription(req.businessContext.businessId);
    }
  );

  // Meshulam webhook (no auth — called by Meshulam servers)
  app.post(
    '/webhooks/meshulam',
    {
      schema: {
        tags: ['Subscriptions'],
        body: meshulamWebhookSchema,
      },
    },
    async (req, reply) => {
      const { statusCode, transactionId, customFields } = req.body;
      const result = await handlePaymentWebhook(transactionId, statusCode, customFields);
      return reply.status(200).send(result);
    }
  );
};

export const subscriptionRoutes = subscriptionRoutesPlugin;
