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
 * Format a bare E.164 phone number for Twilio WhatsApp messaging.
 * Prepends `whatsapp:` prefix.
 */
export function formatWhatsAppTo(e164: string): string {
  if (e164.startsWith(WHATSAPP_PREFIX)) {
    return e164;
  }
  return `${WHATSAPP_PREFIX}${e164}`;
}
