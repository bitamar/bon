import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { invoiceSequences } from '../db/schema.js';
import type * as schema from '../db/schema.js';
import type { DocumentType, SequenceGroup } from '@bon/types/invoices';

type Transaction = NodePgDatabase<typeof schema>;

const SEQUENCE_GROUP_MAP: Record<DocumentType, SequenceGroup> = {
  tax_invoice: 'tax_document',
  tax_invoice_receipt: 'tax_document',
  credit_note: 'credit_note',
  receipt: 'receipt',
};

export function documentTypeToSequenceGroup(documentType: DocumentType): SequenceGroup {
  return SEQUENCE_GROUP_MAP[documentType];
}

/**
 * Assigns a sequential invoice number within a transaction.
 *
 * Uses INSERT ... ON CONFLICT DO UPDATE (upsert) on the composite PK
 * (businessId, sequenceGroup) to atomically claim the next number.
 * On first call the row is inserted with nextNumber = seedNumber + 1;
 * on subsequent calls nextNumber is incremented by 1.
 * The assigned number is always returnedNextNumber − 1.
 *
 * If the transaction rolls back, the sequence number is burned (gap created)
 * — this is acceptable. What is NOT acceptable is two invoices with the same number.
 */
export async function assignInvoiceNumber(
  tx: Transaction,
  businessId: string,
  documentType: DocumentType,
  prefix: string,
  seedNumber: number
): Promise<{ sequenceNumber: number; fullNumber: string }> {
  const group = documentTypeToSequenceGroup(documentType);

  const incrementNext = sql.join([invoiceSequences.nextNumber, sql.raw('+ 1')]).mapWith(Number);

  const [row] = await tx
    .insert(invoiceSequences)
    .values({
      businessId,
      sequenceGroup: group,
      nextNumber: seedNumber + 1,
    })
    .onConflictDoUpdate({
      target: [invoiceSequences.businessId, invoiceSequences.sequenceGroup],
      set: {
        nextNumber: incrementNext,
        updatedAt: new Date(),
      },
    })
    .returning({ nextNumber: invoiceSequences.nextNumber });

  const sequenceNumber = row!.nextNumber - 1;

  const padded = String(sequenceNumber).padStart(4, '0');
  const fullNumber = prefix ? `${prefix}-${padded}` : padded;

  return { sequenceNumber, fullNumber };
}
