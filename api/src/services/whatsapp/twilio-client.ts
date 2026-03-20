import Twilio from 'twilio';
import { formatWhatsAppTo } from '../../lib/phone.js';
import type { WhatsAppService, WhatsAppSendResult } from './whatsapp-types.js';

/** Twilio error codes that indicate the message should NOT be retried. */
const NON_RETRYABLE_CODES = new Set([
  21211, // Invalid 'To' phone number
  63016, // Outside 24-hour session window
  63032, // User has opted out
]);

export class TwilioWhatsAppClient implements WhatsAppService {
  private readonly client: Twilio.Twilio;
  private readonly from: string;

  constructor(accountSid: string, authToken: string, from: string) {
    this.client = Twilio(accountSid, authToken);
    this.from = from;
  }

  async sendMessage(to: string, body: string): Promise<WhatsAppSendResult> {
    try {
      const message = await this.client.messages.create({
        from: this.from,
        to: formatWhatsAppTo(to),
        body,
      });

      return { status: 'sent', messageSid: message.sid };
    } catch (err: unknown) {
      const code =
        err !== null && typeof err === 'object' && 'code' in err && typeof err.code === 'number'
          ? err.code
          : 0;
      const errorMessage = err instanceof Error ? err.message : 'Unknown Twilio error';

      return {
        status: 'failed',
        error: errorMessage,
        retryable: !NON_RETRYABLE_CODES.has(code),
      };
    }
  }
}
