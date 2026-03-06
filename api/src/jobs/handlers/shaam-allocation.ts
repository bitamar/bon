import type { Job } from 'pg-boss';
import type { FastifyInstance } from 'fastify';
import {
  findInvoiceById,
  updateInvoice,
  findItemsByInvoiceId,
} from '../../repositories/invoice-repository.js';
import { findBusinessById } from '../../repositories/business-repository.js';
import { findCustomerById } from '../../repositories/customer-repository.js';
import { insertShaamAuditLog } from '../../repositories/shaam-audit-log-repository.js';
import { buildItaPayload } from '../../services/shaam/build-ita-payload.js';
import { toNumber } from '../../lib/numeric.js';
import type { AllocationRequest, AllocationResult } from '../../services/shaam/types.js';

export interface ShaamAllocationPayload {
  businessId: string;
  invoiceId: string;
}

export function createShaamAllocationHandler(app: FastifyInstance) {
  return async function handleShaamAllocation(jobs: Job<ShaamAllocationPayload>[]): Promise<void> {
    for (const job of jobs) {
      await processAllocationJob(app, job);
    }
  };
}

async function processAllocationJob(
  app: FastifyInstance,
  job: Job<ShaamAllocationPayload>
): Promise<void> {
  const { businessId, invoiceId } = job.data;

  app.log.info({ businessId, invoiceId }, 'SHAAM allocation job started');

  // 1. Load invoice + items + customer + business
  const invoice = await findInvoiceById(invoiceId, businessId);
  if (!invoice) {
    app.log.warn({ invoiceId }, 'SHAAM allocation: invoice not found, skipping');
    return;
  }

  if (invoice.allocationStatus === 'approved') {
    app.log.info({ invoiceId }, 'SHAAM allocation: already approved, skipping');
    return;
  }

  const items = await findItemsByInvoiceId(invoiceId);
  const business = await findBusinessById(businessId);
  if (!business) {
    app.log.warn({ businessId }, 'SHAAM allocation: business not found, skipping');
    return;
  }

  const customer = invoice.customerId
    ? await findCustomerById(invoice.customerId, businessId)
    : null;

  // 2. Build allocation request using T12's AllocationRequest interface
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

  const request: AllocationRequest = {
    businessId,
    invoiceId,
    documentType: invoice.documentType,
    documentNumber: invoice.documentNumber ?? '',
    invoiceDate: invoice.invoiceDate,
    totalExclVatMinorUnits: invoice.totalExclVatMinorUnits,
    vatMinorUnits: invoice.vatMinorUnits,
    totalInclVatMinorUnits: invoice.totalInclVatMinorUnits,
    customerTaxId: invoice.customerTaxId,
    items: items.map((item) => ({
      description: item.description,
      quantity: toNumber(item.quantity),
      unitPriceMinorUnits: item.unitPriceMinorUnits,
      lineTotalMinorUnits: item.lineTotalMinorUnits,
    })),
  };

  // Build ITA payload for audit logging
  const itaPayload = buildItaPayload(
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

  // 3. Call SHAAM service (decorated by T12's shaam plugin)
  let result: AllocationResult;
  try {
    result = await app.shaamService.requestAllocationNumber(request);
  } catch (err: unknown) {
    // Network / unexpected error — log and let pg-boss retry
    await insertShaamAuditLog({
      businessId,
      invoiceId,
      requestPayload: JSON.stringify(itaPayload),
      responsePayload: null,
      httpStatus: null,
      allocationNumber: null,
      errorCode: null,
      result: 'error',
      attemptNumber: 1,
    });

    await updateInvoice(invoiceId, businessId, {
      allocationStatus: 'pending',
      allocationError: err instanceof Error ? err.message : 'Unknown error',
      updatedAt: new Date(),
    });

    app.log.error({ err, invoiceId }, 'SHAAM allocation: service call failed');
    throw err; // pg-boss will retry
  }

  // 4. Log to audit table
  const auditResult = result.status === 'emergency' ? 'approved' : result.status;
  await insertShaamAuditLog({
    businessId,
    invoiceId,
    requestPayload: JSON.stringify(itaPayload),
    responsePayload: JSON.stringify(result),
    httpStatus: null,
    allocationNumber:
      result.status === 'approved'
        ? result.allocationNumber
        : result.status === 'emergency'
          ? result.emergencyNumber
          : null,
    errorCode: result.status === 'rejected' ? result.errorCode : null,
    result: auditResult,
    attemptNumber: 1,
  });

  // 5. Update invoice based on result
  const now = new Date();
  switch (result.status) {
    case 'approved':
      await updateInvoice(invoiceId, businessId, {
        allocationStatus: 'approved',
        allocationNumber: result.allocationNumber,
        allocationError: null,
        updatedAt: now,
      });
      app.log.info(
        { invoiceId, allocationNumber: result.allocationNumber },
        'SHAAM allocation approved'
      );
      break;

    case 'emergency':
      await updateInvoice(invoiceId, businessId, {
        allocationStatus: 'emergency',
        allocationNumber: result.emergencyNumber,
        allocationError: null,
        updatedAt: now,
      });
      app.log.info(
        { invoiceId, emergencyNumber: result.emergencyNumber },
        'SHAAM emergency allocation'
      );
      break;

    case 'rejected':
      await updateInvoice(invoiceId, businessId, {
        allocationStatus: 'rejected',
        allocationError: `${result.errorCode}: ${result.errorMessage}`,
        updatedAt: now,
      });
      app.log.warn({ invoiceId, errorCode: result.errorCode }, 'SHAAM allocation rejected');
      break;

    case 'deferred':
      await updateInvoice(invoiceId, businessId, {
        allocationStatus: 'pending',
        allocationError: result.reason,
        updatedAt: now,
      });
      app.log.info({ invoiceId, reason: result.reason }, 'SHAAM allocation deferred, will retry');
      throw new Error(`SHAAM deferred: ${result.reason}`); // triggers pg-boss retry
  }

  if (customer) {
    app.log.info(
      { invoiceId, customerName: customer.name },
      'SHAAM allocation complete for customer'
    );
  }
}
