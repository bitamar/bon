import { z } from 'zod';

/**
 * Israeli phone number validation and normalization.
 * Israeli-only for now — international support out of scope for WhatsApp MVP.
 */

const ISRAELI_LOCAL_PATTERN = /^0[2-9]\d{7,8}$/;
const ISRAELI_E164_PATTERN = /^\+972[2-9]\d{7,8}$/;

/** Strip spaces, hyphens, dots, and parentheses from a phone string. */
function stripFormatting(input: string): string {
  return input.replace(/[\s\-.()+]/g, '');
}

/**
 * Normalize any reasonable Israeli phone format to local digits.
 * Accepts: `052-123-4567`, `052 1234567`, `0521234567`, `+972521234567`
 * Returns: `0521234567`
 * Throws if the result doesn't match the Israeli local pattern.
 */
export function normalizeIsraeliPhone(input: string): string {
  let digits = stripFormatting(input);

  // Handle +972 prefix (already stripped the +)
  if (digits.startsWith('972') && digits.length >= 11) {
    digits = '0' + digits.slice(3);
  }

  if (!ISRAELI_LOCAL_PATTERN.test(digits)) {
    throw new Error(`Invalid Israeli phone number: ${digits}`);
  }

  return digits;
}

/** Convert local format to E.164: `0521234567` -> `+972521234567` */
export function toE164(localPhone: string): string {
  const normalized = normalizeIsraeliPhone(localPhone);
  return '+972' + normalized.slice(1);
}

/** Convert E.164 to local format: `+972521234567` -> `0521234567` (for display) */
export function fromE164(e164Phone: string): string {
  if (!ISRAELI_E164_PATTERN.test(e164Phone)) {
    throw new Error(`Invalid E.164 Israeli phone: ${e164Phone}`);
  }
  return '0' + e164Phone.slice(4);
}

/** Format local phone for display: `0521234567` -> `052-1234567` */
export function formatIsraeliPhone(localPhone: string): string {
  if (localPhone.length === 10) {
    return localPhone.slice(0, 3) + '-' + localPhone.slice(3);
  }
  if (localPhone.length === 9) {
    return localPhone.slice(0, 2) + '-' + localPhone.slice(2);
  }
  return localPhone;
}

/**
 * Zod schema for Israeli phone input.
 * Accepts formatted input, validates the result matches Israeli format.
 */
export const israeliPhoneSchema = z
  .string()
  .trim()
  .min(1)
  .transform((val) => normalizeIsraeliPhone(val));

/**
 * Zod schema for Israeli phone input that transforms to E.164.
 * For use in user profile updates where we store E.164 format.
 */
export const israeliPhoneE164Schema = z
  .string()
  .trim()
  .min(1)
  .transform((val) => toE164(val));
