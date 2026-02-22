import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../../src/db/client.js';
import { businesses, users } from '../../src/db/schema.js';
import { resetDb } from '../utils/db.js';
import {
  assignInvoiceNumber,
  documentTypeToSequenceGroup,
} from '../../src/lib/invoice-sequences.js';

// ── helpers ──

async function createUser() {
  const [user] = await db
    .insert(users)
    .values({
      email: `seq-${randomUUID()}@example.com`,
      name: 'Seq Test User',
    })
    .returning();
  return user!;
}

async function createBusiness(userId: string) {
  const [business] = await db
    .insert(businesses)
    .values({
      name: 'Seq Test Biz',
      businessType: 'licensed_dealer',
      registrationNumber: randomUUID().replaceAll('-', '').slice(0, 9),
      createdByUserId: userId,
    })
    .returning();
  return business!;
}

async function assignNumber(
  businessId: string,
  documentType: 'tax_invoice' | 'tax_invoice_receipt' | 'credit_note' | 'receipt',
  prefix: string,
  seed: number
) {
  return db.transaction(async (tx) => {
    return assignInvoiceNumber(tx, businessId, documentType, prefix, seed);
  });
}

// ── tests ──

describe('documentTypeToSequenceGroup', () => {
  it('maps tax_invoice to tax_document', () => {
    expect(documentTypeToSequenceGroup('tax_invoice')).toBe('tax_document');
  });

  it('maps tax_invoice_receipt to tax_document', () => {
    expect(documentTypeToSequenceGroup('tax_invoice_receipt')).toBe('tax_document');
  });

  it('maps credit_note to credit_note', () => {
    expect(documentTypeToSequenceGroup('credit_note')).toBe('credit_note');
  });

  it('maps receipt to receipt', () => {
    expect(documentTypeToSequenceGroup('receipt')).toBe('receipt');
  });
});

describe('assignInvoiceNumber', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('returns seed number on first assignment', async () => {
    const user = await createUser();
    const business = await createBusiness(user.id);

    const result = await assignNumber(business.id, 'tax_invoice', 'INV', 1);

    expect(result).toEqual({ sequenceNumber: 1, fullNumber: 'INV-0001' });
  });

  it('increments on second assignment', async () => {
    const user = await createUser();
    const business = await createBusiness(user.id);

    await assignNumber(business.id, 'tax_invoice', 'INV', 1);
    const result = await assignNumber(business.id, 'tax_invoice', 'INV', 1);

    expect(result).toEqual({ sequenceNumber: 2, fullNumber: 'INV-0002' });
  });

  it('keeps different sequence groups independent', async () => {
    const user = await createUser();
    const business = await createBusiness(user.id);

    const invoice = await assignNumber(business.id, 'tax_invoice', 'INV', 1);
    const credit = await assignNumber(business.id, 'credit_note', 'CR', 1);

    expect(invoice.sequenceNumber).toBe(1);
    expect(credit.sequenceNumber).toBe(1);
    expect(invoice.fullNumber).toBe('INV-0001');
    expect(credit.fullNumber).toBe('CR-0001');
  });

  it('shares sequence between tax_invoice and tax_invoice_receipt', async () => {
    const user = await createUser();
    const business = await createBusiness(user.id);

    const first = await assignNumber(business.id, 'tax_invoice', 'INV', 1);
    const second = await assignNumber(business.id, 'tax_invoice_receipt', 'INV', 1);
    const third = await assignNumber(business.id, 'tax_invoice', 'INV', 1);

    expect(first.sequenceNumber).toBe(1);
    expect(second.sequenceNumber).toBe(2);
    expect(third.sequenceNumber).toBe(3);
  });

  it('formats fullNumber correctly with prefix and padding', async () => {
    const user = await createUser();
    const business = await createBusiness(user.id);

    const result = await assignNumber(business.id, 'receipt', 'RCT', 42);

    expect(result).toEqual({ sequenceNumber: 42, fullNumber: 'RCT-0042' });
  });

  it('formats correctly without prefix', async () => {
    const user = await createUser();
    const business = await createBusiness(user.id);

    const result = await assignNumber(business.id, 'tax_invoice', '', 1);

    expect(result).toEqual({ sequenceNumber: 1, fullNumber: '0001' });
  });

  it('handles numbers larger than 9999 without truncation', async () => {
    const user = await createUser();
    const business = await createBusiness(user.id);

    const result = await assignNumber(business.id, 'tax_invoice', 'INV', 12345);

    expect(result).toEqual({ sequenceNumber: 12345, fullNumber: 'INV-12345' });
  });
});
