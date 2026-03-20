/**
 * SHAAM (שע"מ) allocation trigger logic — pure functions, no side effects.
 *
 * Used by both API (to decide whether to enqueue allocation jobs)
 * and potentially frontend (to show "requires allocation" indicators).
 */

import { z } from 'zod';

// ── Threshold schedule ──
// Amounts in ILS (major units). Sorted newest-first so currentThresholdILS()
// returns the first entry whose `from` date has passed.

interface ThresholdEntry {
  readonly from: Date;
  readonly thresholdILS: number;
}

export const ALLOCATION_THRESHOLDS: readonly ThresholdEntry[] = [
  { from: new Date('2026-06-01'), thresholdILS: 5_000 },
  { from: new Date('2026-01-01'), thresholdILS: 10_000 },
  { from: new Date('2025-01-01'), thresholdILS: 20_000 },
  { from: new Date('2024-01-01'), thresholdILS: 25_000 },
];

/**
 * Returns the allocation threshold in ILS for a given date.
 * Falls back to the oldest threshold if the date is before all entries.
 */
export function currentThresholdILS(asOfDate: Date = new Date()): number {
  for (const entry of ALLOCATION_THRESHOLDS) {
    if (asOfDate >= entry.from) {
      return entry.thresholdILS;
    }
  }
  // Before the earliest entry — use the oldest threshold
  const oldest = ALLOCATION_THRESHOLDS.at(-1);
  return oldest ? oldest.thresholdILS : 25_000;
}

/**
 * Determines whether an invoice legally requires an allocation number from SHAAM.
 *
 * Criteria:
 * 1. Invoice has VAT (vatMinorUnits > 0) — zero-VAT invoices are exempt
 * 2. Customer is a licensed dealer (עוסק מורשה)
 * 3. Invoice total (excl. VAT) is strictly above the current threshold
 */
export function requiresAllocationNumber(
  invoice: Readonly<{ totalExclVatMinorUnits: number; vatMinorUnits: number }>,
  customer: Readonly<{ isLicensedDealer: boolean }>,
  asOfDate: Date = new Date()
): boolean {
  if (invoice.vatMinorUnits === 0) return false;
  if (!customer.isLicensedDealer) return false;

  const thresholdMinorUnits = currentThresholdILS(asOfDate) * 100;
  return invoice.totalExclVatMinorUnits > thresholdMinorUnits;
}

/**
 * Determines whether an allocation should be requested.
 * Currently delegates to requiresAllocationNumber().
 *
 * Future: Add `business.alwaysRequestAllocation` opt-in (tracked in T14).
 */
export function shouldRequestAllocation(
  invoice: Readonly<{ totalExclVatMinorUnits: number; vatMinorUnits: number }>,
  customer: Readonly<{ isLicensedDealer: boolean }>,
  asOfDate: Date = new Date()
): boolean {
  return requiresAllocationNumber(invoice, customer, asOfDate);
}

// ── ITA document type codes ──

export const ITA_DOCUMENT_TYPE_CODES = {
  tax_invoice: 305,
  tax_invoice_receipt: 320,
  receipt: 400,
  credit_note: 330,
} as const;

// ── ITA payload schemas ──

export const itaLineItemSchema = z.object({
  LineNumber: z.number().int().positive(),
  Description: z.string(),
  Quantity: z.number(),
  UnitPrice: z.number(),
  Discount: z.number(),
  TotalLineBefore: z.number(),
  VatRate: z.number(),
  VatAmount: z.number(),
  TotalLineAfter: z.number(),
});

export const itaRequestPayloadSchema = z.object({
  InvoiceType: z.number().int(),
  VatNumber: z.string(),
  InvoiceNumber: z.string(),
  InvoiceDate: z.string(),
  ClientName: z.string(),
  ClientVatNumber: z.string().optional(),
  DealAmount: z.number(),
  VatAmount: z.number(),
  TotalAmount: z.number(),
  Currency: z.string(),
  LineItems: z.array(itaLineItemSchema),
  AccountingSoftwareNumber: z.string().optional(),
});

export type ItaLineItem = z.infer<typeof itaLineItemSchema>;
export type ItaRequestPayload = z.infer<typeof itaRequestPayloadSchema>;

// ── ITA Error Codes ──

export const ITA_ERROR_CODES = {
  E001: 'E001',
  E002: 'E002',
  E003: 'E003',
  E010: 'E010',
  E099: 'E099',
} as const;

export type ItaErrorCode = (typeof ITA_ERROR_CODES)[keyof typeof ITA_ERROR_CODES];

export interface ItaErrorInfo {
  readonly code: ItaErrorCode;
  readonly hebrewMessage: string;
  readonly userVisible: boolean;
}

export const ITA_ERROR_MAP: Record<ItaErrorCode, ItaErrorInfo> = {
  E001: {
    code: 'E001',
    hebrewMessage: 'מספר מע״מ לא תקין — בדוק את פרטי העסק',
    userVisible: true,
  },
  E002: {
    code: 'E002',
    hebrewMessage: 'חשבונית כבר קיבלה מספר הקצאה',
    userVisible: false,
  },
  E003: {
    code: 'E003',
    hebrewMessage: 'חשבונית מתחת לסף — לא נדרש מספר הקצאה',
    userVisible: false,
  },
  E010: {
    code: 'E010',
    hebrewMessage: 'נדרש חיבור מחדש למערכת שע״מ',
    userVisible: true,
  },
  E099: {
    code: 'E099',
    hebrewMessage: 'שע״מ לא זמין — הוקצה מספר חירום',
    userVisible: true,
  },
};

export const EMERGENCY_POOL_LOW_THRESHOLD = 5;
export const EMERGENCY_POOL_EMPTY_MESSAGE = 'שע״מ לא זמין ומאגר מספרי החירום ריק';

// ── Emergency number schemas ──

export const emergencyNumberSchema = z.object({
  id: z.string().uuid(),
  businessId: z.string().uuid(),
  number: z.string(),
  used: z.boolean(),
  usedForInvoiceId: z.string().uuid().nullable(),
  usedAt: z.string().nullable(),
  reported: z.boolean(),
  reportedAt: z.string().nullable(),
  acquiredAt: z.string(),
});

export type EmergencyNumber = z.infer<typeof emergencyNumberSchema>;

export const addEmergencyNumbersBodySchema = z.object({
  numbers: z.array(z.string().trim().min(1).max(50)).min(1).max(100),
});

export type AddEmergencyNumbersBody = z.infer<typeof addEmergencyNumbersBodySchema>;

export const emergencyNumbersResponseSchema = z.object({
  numbers: z.array(emergencyNumberSchema),
  availableCount: z.number().int().nonnegative(),
  usedCount: z.number().int().nonnegative(),
});

export type EmergencyNumbersResponse = z.infer<typeof emergencyNumbersResponseSchema>;
