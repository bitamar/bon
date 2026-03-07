import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ensureBusinessContext } from '../plugins/business-context.js';
import { addEmergencyNumbersBodySchema, emergencyNumbersResponseSchema } from '@bon/types/shaam';
import {
  insertEmergencyNumbers,
  findEmergencyNumbersByBusinessId,
  findAvailableCount,
  findUsedCount,
  deleteEmergencyNumber,
} from '../repositories/emergency-allocation-repository.js';
import { badRequest, notFound } from '../lib/app-error.js';

function serializeNumber(row: {
  id: string;
  businessId: string;
  number: string;
  used: boolean;
  usedForInvoiceId: string | null;
  usedAt: Date | null;
  reported: boolean;
  reportedAt: Date | null;
  acquiredAt: Date;
}) {
  return {
    id: row.id,
    businessId: row.businessId,
    number: row.number,
    used: row.used,
    usedForInvoiceId: row.usedForInvoiceId,
    usedAt: row.usedAt?.toISOString() ?? null,
    reported: row.reported,
    reportedAt: row.reportedAt?.toISOString() ?? null,
    acquiredAt: row.acquiredAt.toISOString(),
  };
}

const emergencyNumbersRoutesPlugin: FastifyPluginAsyncZod = async (app) => {
  // GET /businesses/:businessId/emergency-numbers
  app.get(
    '/businesses/:businessId/emergency-numbers',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess, app.requireBusinessRole('owner', 'admin')],
      schema: {
        tags: ['Emergency Numbers'],
        params: z.object({ businessId: z.string().uuid() }),
        response: { 200: emergencyNumbersResponseSchema },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      const { businessId } = req.businessContext;

      const [numbers, availableCount, usedCount] = await Promise.all([
        findEmergencyNumbersByBusinessId(businessId),
        findAvailableCount(businessId),
        findUsedCount(businessId),
      ]);

      return {
        numbers: numbers.map(serializeNumber),
        availableCount,
        usedCount,
      };
    }
  );

  // POST /businesses/:businessId/emergency-numbers
  app.post(
    '/businesses/:businessId/emergency-numbers',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess, app.requireBusinessRole('owner')],
      schema: {
        tags: ['Emergency Numbers'],
        params: z.object({ businessId: z.string().uuid() }),
        body: addEmergencyNumbersBodySchema,
        response: { 201: emergencyNumbersResponseSchema },
      },
    },
    async (req, reply) => {
      ensureBusinessContext(req);
      const { businessId } = req.businessContext;
      const { numbers } = req.body;

      if (numbers.length === 0) {
        throw badRequest({ message: 'יש להזין לפחות מספר חירום אחד' });
      }

      const now = new Date();
      const data = numbers.map((num) => ({
        businessId,
        number: num,
        acquiredAt: now,
      }));

      await insertEmergencyNumbers(data);

      const [allNumbers, availableCount, usedCount] = await Promise.all([
        findEmergencyNumbersByBusinessId(businessId),
        findAvailableCount(businessId),
        findUsedCount(businessId),
      ]);

      return reply.status(201).send({
        numbers: allNumbers.map(serializeNumber),
        availableCount,
        usedCount,
      });
    }
  );

  // DELETE /businesses/:businessId/emergency-numbers/:id
  app.delete(
    '/businesses/:businessId/emergency-numbers/:id',
    {
      preHandler: [app.authenticate, app.requireBusinessAccess, app.requireBusinessRole('owner')],
      schema: {
        tags: ['Emergency Numbers'],
        params: z.object({
          businessId: z.string().uuid(),
          id: z.string().uuid(),
        }),
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (req) => {
      ensureBusinessContext(req);
      const { businessId } = req.businessContext;
      const { id } = req.params;

      const deleted = await deleteEmergencyNumber(id, businessId);
      if (!deleted) {
        throw notFound({ message: 'מספר חירום לא נמצא או כבר בשימוש' });
      }

      return { ok: true as const };
    }
  );
};

export const emergencyNumberRoutes = emergencyNumbersRoutesPlugin;
