import type { FastifyBaseLogger } from 'fastify';
import type { Job, JobWithMetadata, PgBoss } from 'pg-boss';
import type { JobPayloads } from '../boss.js';
import { sendJob } from '../boss.js';
import {
  findInvoiceById,
  updateInvoice,
  findItemsByInvoiceId,
} from '../../repositories/invoice-repository.js';
import { findBusinessById } from '../../repositories/business-repository.js';
import { findCustomerById } from '../../repositories/customer-repository.js';
import { insertShaamAuditLog } from '../../repositories/shaam-audit-log-repository.js';
import { consumeNext } from '../../repositories/emergency-allocation-repository.js';
import { markNeedsReauth } from '../../repositories/shaam-credentials-repository.js';
import { buildItaPayload } from '../../services/shaam/build-ita-payload.js';
import { toNumber } from '../../lib/numeric.js';
import { ITA_ERROR_MAP, EMERGENCY_POOL_EMPTY_MESSAGE, type ItaErrorCode } from '@bon/types/shaam';
import type {
  AllocationRequest,
  AllocationResult,
  ShaamService,
} from '../../services/shaam/types.js';

function resolveAllocationNumber(result: AllocationResult): string | null {
  if (result.status === 'approved') return result.allocationNumber;
  if (result.status === 'emergency') return result.emergencyNumber;
  return null;
}

function getErrorMessage(errorCode: string, fallbackMessage: string): string {
  const info = ITA_ERROR_MAP[errorCode as ItaErrorCode];
  return info ? info.hebrewMessage : `${errorCode}: ${fallbackMessage}`;
}

/**
 * Creates the shaam-allocation-request handler.
 * Wrapped with `runJob()` at registration time for structured logging.
 */
export function createShaamAllocationHandler(
  shaamService: ShaamService,
  logger: FastifyBaseLogger,
  boss?: PgBoss
): (job: Job<JobPayloads['shaam-allocation-request']>) => Promise<void> {
  return async (job) => {
    const { businessId, invoiceId } = job.data;
    const meta = job as Partial<JobWithMetadata<JobPayloads['shaam-allocation-request']>>;
    const attemptNumber = (meta.retryCount ?? 0) + 1;

    logger.info({ businessId, invoiceId, attemptNumber }, 'SHAAM allocation job started');

    // 1. Load invoice + items + customer + business
    const invoice = await findInvoiceById(invoiceId, businessId);
    if (!invoice) {
      logger.warn({ invoiceId }, 'SHAAM allocation: invoice not found, skipping');
      return;
    }

    if (invoice.allocationStatus === 'approved') {
      logger.info({ invoiceId }, 'SHAAM allocation: already approved, skipping');
      return;
    }

    const items = await findItemsByInvoiceId(invoiceId);
    const business = await findBusinessById(businessId);
    if (!business) {
      logger.warn({ businessId }, 'SHAAM allocation: business not found, skipping');
      return;
    }

    const customer = invoice.customerId
      ? await findCustomerById(invoice.customerId, businessId)
      : null;

    // 2. Build allocation request + ITA payload, call SHAAM, and log audit
    let result: AllocationResult;
    let request: AllocationRequest | null = null;
    let itaPayload: ReturnType<typeof buildItaPayload> | null = null;
    try {
      const lineItemsData = items.map((item) => ({
        position: item.position,
        description: item.description,
        quantity: toNumber(item.quantity),
        unitPriceMinorUnits: item.unitPriceMinorUnits,
        discountPercent: toNumber(item.discountPercent),
        vatRateBasisPoints: item.vatRateBasisPoints,
        lineTotalMinorUnits: item.lineTotalMinorUnits,
        vatAmountMinorUnits: item.vatAmountMinorUnits,
        lineTotalInclVatMinorUnits: item.lineTotalInclVatMinorUnits,
      }));

      request = {
        businessId,
        invoiceId,
        documentType: invoice.documentType,
        documentNumber: invoice.documentNumber ?? '',
        invoiceDate: invoice.invoiceDate,
        totalExclVatMinorUnits: invoice.totalExclVatMinorUnits,
        vatMinorUnits: invoice.vatMinorUnits,
        totalInclVatMinorUnits: invoice.totalInclVatMinorUnits,
        customerTaxId: invoice.customerTaxId,
        items: lineItemsData.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPriceMinorUnits: item.unitPriceMinorUnits,
          lineTotalMinorUnits: item.lineTotalMinorUnits,
        })),
      };

      itaPayload = buildItaPayload(
        {
          id: invoice.id,
          businessId: invoice.businessId,
          documentType: invoice.documentType,
          documentNumber: invoice.documentNumber,
          invoiceDate: invoice.invoiceDate,
          customerName: invoice.customerName,
          customerTaxId: invoice.customerTaxId,
          totalExclVatMinorUnits: invoice.totalExclVatMinorUnits,
          vatMinorUnits: invoice.vatMinorUnits,
          totalInclVatMinorUnits: invoice.totalInclVatMinorUnits,
          currency: invoice.currency,
        },
        lineItemsData,
        { vatNumber: business.vatNumber }
      );

      result = await shaamService.requestAllocationNumber(request);
    } catch (err: unknown) {
      // Payload build or SHAAM call failed — log and let pg-boss retry
      await insertShaamAuditLog({
        businessId,
        invoiceId,
        requestPayload: JSON.stringify(itaPayload ?? request ?? { invoiceId }),
        responsePayload: null,
        httpStatus: null,
        allocationNumber: null,
        errorCode: null,
        result: 'error',
        attemptNumber,
      });

      await updateInvoice(invoiceId, businessId, {
        allocationStatus: 'pending',
        allocationError: err instanceof Error ? err.message : 'Unknown error',
        updatedAt: new Date(),
      });

      logger.error({ err, invoiceId }, 'SHAAM allocation: service call failed');
      throw err; // pg-boss will retry
    }

    // 3. Log result to audit table
    const allocationNumber = resolveAllocationNumber(result);
    await insertShaamAuditLog({
      businessId,
      invoiceId,
      requestPayload: JSON.stringify(itaPayload),
      responsePayload: JSON.stringify(result),
      httpStatus: null,
      allocationNumber,
      errorCode: result.status === 'rejected' ? result.errorCode : null,
      result: result.status,
      attemptNumber,
    });

    // 4. Update invoice based on result
    const now = new Date();
    switch (result.status) {
      case 'approved': {
        await updateInvoice(invoiceId, businessId, {
          allocationStatus: 'approved',
          allocationNumber: result.allocationNumber,
          allocationError: null,
          updatedAt: now,
        });
        logger.info(
          { invoiceId, allocationNumber: result.allocationNumber },
          'SHAAM allocation approved'
        );

        // If previous status was emergency, SHAAM is back — enqueue recovery report
        if (invoice.allocationStatus === 'emergency' && boss) {
          await sendJob(
            boss,
            'shaam-emergency-report',
            { businessId },
            {
              singletonKey: businessId,
              retryLimit: 3,
              retryDelay: 300,
              retryBackoff: true,
            }
          );
          logger.info({ businessId }, 'SHAAM recovery report enqueued');
        }
        break;
      }

      case 'emergency':
        await updateInvoice(invoiceId, businessId, {
          allocationStatus: 'emergency',
          allocationNumber: result.emergencyNumber,
          allocationError: null,
          updatedAt: now,
        });
        logger.info(
          { invoiceId, emergencyNumber: result.emergencyNumber },
          'SHAAM emergency allocation'
        );
        break;

      case 'rejected':
        await handleRejection(result, businessId, invoiceId, now, logger, boss);
        break;

      case 'deferred':
        await updateInvoice(invoiceId, businessId, {
          allocationStatus: 'pending',
          allocationError: result.reason,
          updatedAt: now,
        });
        logger.info({ invoiceId, reason: result.reason }, 'SHAAM allocation deferred, will retry');
        throw new Error(`SHAAM deferred: ${result.reason}`); // triggers pg-boss retry
    }

    if (customer) {
      logger.info(
        { invoiceId, customerName: customer.name },
        'SHAAM allocation complete for customer'
      );
    }
  };
}

async function handleRejection(
  result: Extract<AllocationResult, { status: 'rejected' }>,
  businessId: string,
  invoiceId: string,
  now: Date,
  logger: FastifyBaseLogger,
  boss?: PgBoss
): Promise<void> {
  const { errorCode, errorMessage } = result;
  const hebrewMessage = getErrorMessage(errorCode, errorMessage);

  // E010: auth failure — mark business needing re-auth
  if (errorCode === 'E010') {
    await markNeedsReauth(businessId);
    logger.warn({ businessId, invoiceId }, 'SHAAM E010: marked business as needing re-auth');
  }

  // E099: SHAAM unavailable — try emergency pool
  if (errorCode === 'E099') {
    const emergencyNumber = await consumeNext(businessId, invoiceId);
    if (emergencyNumber) {
      await updateInvoice(invoiceId, businessId, {
        allocationStatus: 'emergency',
        allocationNumber: emergencyNumber.number,
        allocationError: null,
        updatedAt: now,
      });

      // Log emergency usage as a separate audit entry
      await insertShaamAuditLog({
        businessId,
        invoiceId,
        requestPayload: JSON.stringify({ action: 'emergency_fallback' }),
        responsePayload: JSON.stringify({ emergencyNumber: emergencyNumber.number }),
        httpStatus: null,
        allocationNumber: emergencyNumber.number,
        errorCode: null,
        result: 'emergency',
        attemptNumber: 1,
      });

      logger.info(
        { invoiceId, emergencyNumber: emergencyNumber.number },
        'SHAAM E099: used emergency number'
      );
      return;
    }

    // Pool empty
    await updateInvoice(invoiceId, businessId, {
      allocationStatus: 'rejected',
      allocationError: EMERGENCY_POOL_EMPTY_MESSAGE,
      updatedAt: now,
    });
    logger.warn({ invoiceId, businessId }, 'SHAAM E099: emergency pool empty');
    return;
  }

  // E002: already allocated — idempotent, treat as approved
  if (errorCode === 'E002') {
    logger.info({ invoiceId }, 'SHAAM E002: already allocated, treating as approved');

    // Enqueue recovery report since we just got a successful response from SHAAM
    if (boss) {
      await sendJob(
        boss,
        'shaam-emergency-report',
        { businessId },
        {
          singletonKey: businessId,
          retryLimit: 3,
          retryDelay: 300,
          retryBackoff: true,
        }
      );
    }
    return;
  }

  // E003: below threshold — shouldn't happen, log warning only
  if (errorCode === 'E003') {
    logger.warn(
      { invoiceId, businessId },
      'SHAAM E003: below threshold — possible logic error in shouldRequestAllocation()'
    );
    await updateInvoice(invoiceId, businessId, {
      allocationStatus: null,
      allocationError: null,
      updatedAt: now,
    });
    return;
  }

  // All other error codes — store per-code Hebrew message
  await updateInvoice(invoiceId, businessId, {
    allocationStatus: 'rejected',
    allocationError: hebrewMessage,
    updatedAt: now,
  });
  logger.warn({ invoiceId, errorCode }, 'SHAAM allocation rejected');
}
