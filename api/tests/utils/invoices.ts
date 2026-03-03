import { vi } from 'vitest';
import { injectAuthed } from './inject.js';
import { createOwnerWithBusiness } from './businesses.js';
import type { FastifyInstance } from 'fastify';
import type { InvoiceResponse } from '@bon/types/invoices';

export const FAKE_PDF = Buffer.from('%PDF-1.4 fake content');

export interface TestItem {
  description: string;
  quantity: number;
  unitPriceMinorUnits: number;
  discountPercent: number;
  vatRateBasisPoints: number;
  position: number;
}

export const DEFAULT_ITEM: TestItem = {
  description: 'Item 1',
  quantity: 1,
  unitPriceMinorUnits: 10000,
  discountPercent: 0,
  vatRateBasisPoints: 1700,
  position: 0,
};

export function mockPdfServiceFetch(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(FAKE_PDF, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    })
  );
}

export async function createCustomer(
  app: FastifyInstance,
  sessionId: string,
  businessId: string,
  email?: string
) {
  const payload: Record<string, string> = { name: 'Test Customer' };
  if (email !== undefined) {
    payload.email = email;
  }
  const res = await injectAuthed(app, sessionId, {
    method: 'POST',
    url: `/businesses/${businessId}/customers`,
    payload,
  });
  return (res.json() as { customer: { id: string } }).customer;
}

export async function createDraftWithItems(
  app: FastifyInstance,
  sessionId: string,
  businessId: string,
  customerId: string
) {
  const res = await injectAuthed(app, sessionId, {
    method: 'POST',
    url: `/businesses/${businessId}/invoices`,
    payload: {
      documentType: 'tax_invoice',
      customerId,
      items: [DEFAULT_ITEM],
    },
  });
  return res.json() as InvoiceResponse;
}

export async function finalizeInvoice(
  app: FastifyInstance,
  sessionId: string,
  businessId: string,
  invoiceId: string
) {
  return injectAuthed(app, sessionId, {
    method: 'POST',
    url: `/businesses/${businessId}/invoices/${invoiceId}/finalize`,
    payload: {},
  });
}

export async function setupFinalizedInvoice(
  app: FastifyInstance,
  customerEmail = 'customer@example.com'
) {
  const { sessionId, business } = await createOwnerWithBusiness();
  const customer = await createCustomer(app, sessionId, business.id, customerEmail);
  const { invoice } = await createDraftWithItems(app, sessionId, business.id, customer.id);
  await finalizeInvoice(app, sessionId, business.id, invoice.id);
  return { sessionId, business, invoice };
}
