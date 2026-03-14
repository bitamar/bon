import { createHmac, timingSafeEqual } from 'node:crypto';
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
import { env } from '../env.js';

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
      await startTrial(req.businessContext.businessId);
      const status = await getSubscriptionStatus(req.businessContext.businessId);
      return reply.status(201).send(status);
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
      // Verify webhook signature when secret is configured
      if (env.MESHULAM_WEBHOOK_SECRET) {
        const signature = req.headers['x-meshulam-signature'] as string | undefined;
        if (!signature) {
          req.log.warn('Meshulam webhook received without signature header');
          return reply.status(401).send({ error: 'Missing webhook signature' });
        }
        const rawBody = JSON.stringify(req.body);
        const expected = createHmac('sha256', env.MESHULAM_WEBHOOK_SECRET)
          .update(rawBody)
          .digest('hex');
        const sigBuffer = Buffer.from(signature, 'hex');
        const expectedBuffer = Buffer.from(expected, 'hex');
        if (
          sigBuffer.length !== expectedBuffer.length ||
          !timingSafeEqual(sigBuffer, expectedBuffer)
        ) {
          req.log.warn('Meshulam webhook signature mismatch');
          return reply.status(401).send({ error: 'Invalid webhook signature' });
        }
      }

      const { statusCode, transactionId, sum, customFields } = req.body;
      const result = await handlePaymentWebhook(transactionId, statusCode, sum, customFields);
      return reply.status(200).send(result);
    }
  );
};

export const subscriptionRoutes = subscriptionRoutesPlugin;
