/**
 * Israeli phone number validation and normalization.
 * Israeli-only for now — international support out of scope for WhatsApp MVP.
 */

const ISRAELI_LOCAL_PATTERN = /^0[2-9]\d{7,8}$/;

/** Strip spaces, hyphens, dots, and parentheses from a phone string. */
function stripFormatting(input: string): string {
  return Array.from(input)
    .filter((c) => c >= '0' && c <= '9')
    .join('');
}

/**
 * Normalize any reasonable Israeli phone format to local digits.
 * Accepts: `052-123-4567`, `052 1234567`, `0521234567`, `+972521234567`
 * Returns: `0521234567`
 * Throws if the result doesn't match the Israeli local pattern.
 */
export function normalizeIsraeliPhone(input: string): string {
  let digits = stripFormatting(input);

  // Handle 972 prefix: 11-13 digits (8-10 local digits after 972)
  if (digits.startsWith('972') && digits.length >= 11 && digits.length <= 13) {
    digits = '0' + digits.slice(3);
  }

  if (!ISRAELI_LOCAL_PATTERN.test(digits)) {
    throw new Error('Invalid Israeli phone number');
  }

  return digits;
}

/** Convert local format to E.164: `0521234567` -> `+972521234567` */
export function toE164(localPhone: string): string {
  const normalized = normalizeIsraeliPhone(localPhone);
  return '+972' + normalized.slice(1);
}
