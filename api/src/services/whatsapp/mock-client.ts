import { randomUUID } from 'node:crypto';
import type { WhatsAppService, WhatsAppSendResult } from './whatsapp-types.js';

export interface SentMessage {
  to: string;
  body: string;
  sid: string;
}

export class MockWhatsAppClient implements WhatsAppService {
  readonly sentMessages: SentMessage[] = [];

  async sendMessage(to: string, body: string): Promise<WhatsAppSendResult> {
    const sid = `SM${randomUUID().replaceAll('-', '')}`;
    this.sentMessages.push({ to, body, sid });
    return { status: 'sent', messageSid: sid };
  }

  /** Clear sent messages (useful in tests). */
  clear(): void {
    this.sentMessages.length = 0;
  }
}
