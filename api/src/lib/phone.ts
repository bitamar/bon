const WHATSAPP_PREFIX = 'whatsapp:';

/**
 * Strip the `whatsapp:` prefix from a Twilio WhatsApp sender/recipient.
 * Returns the bare E.164 phone number.
 */
export function stripWhatsAppPrefix(twilioFrom: string): string {
  if (twilioFrom.startsWith(WHATSAPP_PREFIX)) {
    return twilioFrom.slice(WHATSAPP_PREFIX.length);
  }
  return twilioFrom;
}

/**
 * Format a phone number for Twilio WhatsApp messaging.
 * Ensures `whatsapp:+<digits>` format (E.164 with prefix).
 */
export function formatWhatsAppTo(phone: string): string {
  if (phone.startsWith(WHATSAPP_PREFIX)) {
    const number = phone.slice(WHATSAPP_PREFIX.length);
    return number.startsWith('+') ? phone : `${WHATSAPP_PREFIX}+${number}`;
  }
  const e164 = phone.startsWith('+') ? phone : `+${phone}`;
  return `${WHATSAPP_PREFIX}${e164}`;
}
