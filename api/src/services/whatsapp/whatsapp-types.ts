export type WhatsAppSendResult =
  | { status: 'sent'; messageSid: string }
  | { status: 'failed'; error: string; retryable: boolean };

export interface WhatsAppService {
  sendMessage(to: string, body: string): Promise<WhatsAppSendResult>;
}
