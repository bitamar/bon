import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ensureBusinessContext } from '../plugins/business-context.js';
import {
  createInvoiceDraftBodySchema,
  createCreditNoteBodySchema,
  updateInvoiceDraftBodySchema,
  finalizeInvoiceBodySchema,
  sendInvoiceBodySchema,
  sendInvoiceResponseSchema,
  invoiceResponseSchema,
  invoiceListQuerySchema,
  invoiceListResponseSchema,
  invoiceIdParamSchema,
} from '@bon/types/invoices';
import {
  recordPaymentBodySchema,
  paymentListResponseSchema,
  paymentIdParamSchema,
} from '@bon/types/payments';
import { businessIdParamSchema } from '@bon/types/businesses';
import { okResponseSchema } from '@bon/types/common';
import {
  createDraft,
  getInvoice,
  listInvoices,
  updateDraft,
  deleteDraft,
  finalize,
  sendInvoice,
  createCreditNote,
  enqueueShaamAllocation,
  recordPayment,
  deletePayment,
  listPayments,
} from '../services/invoice-service.js';
import { generateInvoicePdf } from '../services/pdf-service.js';
import { assertCanCreateInvoice } from '../services/subscription-service.js';
import { notifyBusinessUsersViaWhatsApp } from '../services/whatsapp/notifications.js';
import { formatMinorUnits } from '@bon/types/formatting';

const invoiceRoutesPlugin: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/businesses/:businessId/invoices',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        tags: ['Invoices'],
        params: businessIdParamSchema,
        body: createInvoiceDraftBodySchema,
        response: {
          201: invoiceResponseSchema,
        },
      },
    },
    async (req, reply) => {
      ensureBusinessContext(req);
      await assertCanCreateInvoice(req.businessContext.businessId);
      const result = await createDraft(req.businessContext.businessId, req.body);
      return reply.status(201).send(result);
    }
  );

  app.get(
    '/businesses/:businessId/invoices',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        tags: ['Invoices'],
        params: businessIdParamSchema,
        querystring: invoiceListQuerySchema,
        response: {
          200: invoiceListResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      return listInvoices(req.businessContext.businessId, req.query);
    }
  );

  app.get(
    '/businesses/:businessId/invoices/:invoiceId',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        tags: ['Invoices'],
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
        tags: ['Invoices'],
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
      preHandler: [
        app.authenticate,
        app.requireBusinessAccess,
        app.requireBusinessRole('owner', 'admin'),
      ],
      schema: {
        tags: ['Invoices'],
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
      preHandler: [
        app.authenticate,
        app.requireBusinessAccess,
        app.requireBusinessRole('owner', 'admin'),
      ],
      schema: {
        tags: ['Invoices'],
        params: invoiceIdParamSchema,
        body: finalizeInvoiceBodySchema,
        response: {
          200: invoiceResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      await assertCanCreateInvoice(req.businessContext.businessId);
      const result = await finalize(req.businessContext.businessId, req.params.invoiceId, req.body);

      if (result.needsAllocation && app.boss) {
        enqueueShaamAllocation(
          app.boss,
          req.businessContext.businessId,
          req.params.invoiceId,
          req.log
        );
      }

      const { needsAllocation: _, ...response } = result;
      return response;
    }
  );

  app.post(
    '/businesses/:businessId/invoices/:invoiceId/send',
    {
      preHandler: [
        app.authenticate,
        app.requireBusinessAccess,
        app.requireBusinessRole('owner', 'admin'),
      ],
      schema: {
        tags: ['Invoices'],
        params: invoiceIdParamSchema,
        body: sendInvoiceBodySchema,
        response: {
          202: sendInvoiceResponseSchema,
        },
      },
    },
    async (req, reply) => {
      ensureBusinessContext(req);
      const { businessId } = req.businessContext;
      const { invoiceId } = req.params;
      const result = await sendInvoice(businessId, invoiceId, req.body, app.boss);

      // Fire-and-forget WhatsApp notification
      if (app.boss && result.documentNumber && result.customerName) {
        await notifyBusinessUsersViaWhatsApp(
          businessId,
          'invoice_sent',
          {
            documentNumber: result.documentNumber,
            customerName: result.customerName,
          },
          app.boss,
          app.log
        );
      }

      return reply.status(202).send({ ok: true as const, status: result.status });
    }
  );

  app.post(
    '/businesses/:businessId/invoices/:invoiceId/credit-note',
    {
      preHandler: [
        app.authenticate,
        app.requireBusinessAccess,
        app.requireBusinessRole('owner', 'admin'),
      ],
      schema: {
        tags: ['Invoices'],
        params: invoiceIdParamSchema,
        body: createCreditNoteBodySchema,
        response: {
          201: invoiceResponseSchema,
        },
      },
    },
    async (req, reply) => {
      ensureBusinessContext(req);
      await assertCanCreateInvoice(req.businessContext.businessId);
      const result = await createCreditNote(
        req.businessContext.businessId,
        req.params.invoiceId,
        req.body
      );

      if (result.needsAllocation && app.boss) {
        enqueueShaamAllocation(
          app.boss,
          req.businessContext.businessId,
          result.invoice.id,
          req.log
        );
      }

      const { needsAllocation: _, ...response } = result;
      return reply.status(201).send(response);
    }
  );

  app.get(
    '/businesses/:businessId/invoices/:invoiceId/pdf',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        tags: ['Invoices'],
        params: invoiceIdParamSchema,
      },
    },
    async (req, reply) => {
      ensureBusinessContext(req);
      const { pdf, filename } = await generateInvoicePdf(
        req.businessContext.businessId,
        req.params.invoiceId
      );
      const safeFilename = filename.replaceAll(/[^\w.-]/g, '_');
      return reply
        .type('application/pdf')
        .header('Content-Disposition', `inline; filename="${safeFilename}"`)
        .send(pdf);
    }
  );
  // ── Payment routes ──

  app.post(
    '/businesses/:businessId/invoices/:invoiceId/payments',
    {
      preHandler: [
        app.authenticate,
        app.requireBusinessAccess,
        app.requireBusinessRole('owner', 'admin'),
      ],
      schema: {
        tags: ['Invoices'],
        params: invoiceIdParamSchema,
        body: recordPaymentBodySchema,
        response: {
          201: invoiceResponseSchema,
        },
      },
    },
    async (req, reply) => {
      ensureBusinessContext(req);
      const { businessId } = req.businessContext;
      const result = await recordPayment(businessId, req.params.invoiceId, req.body, req.user!.id);

      // Fire-and-forget WhatsApp notification
      if (app.boss && result.invoice.documentNumber) {
        await notifyBusinessUsersViaWhatsApp(
          businessId,
          'payment_received',
          {
            amount: formatMinorUnits(req.body.amountMinorUnits),
            documentNumber: result.invoice.documentNumber,
          },
          app.boss,
          app.log
        );
      }

      return reply.status(201).send(result);
    }
  );

  app.get(
    '/businesses/:businessId/invoices/:invoiceId/payments',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess],
      schema: {
        tags: ['Invoices'],
        params: invoiceIdParamSchema,
        response: {
          200: paymentListResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      return listPayments(req.businessContext.businessId, req.params.invoiceId);
    }
  );

  app.delete(
    '/businesses/:businessId/invoices/:invoiceId/payments/:paymentId',
    {
      preHandler: [
        app.authenticate,
        app.requireBusinessAccess,
        app.requireBusinessRole('owner', 'admin'),
      ],
      schema: {
        tags: ['Invoices'],
        params: paymentIdParamSchema,
        response: {
          200: invoiceResponseSchema,
        },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      return deletePayment(
        req.businessContext.businessId,
        req.params.invoiceId,
        req.params.paymentId
      );
    }
  );
};

export const invoiceRoutes = invoiceRoutesPlugin;
