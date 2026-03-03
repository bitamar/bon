import { Resend } from 'resend';
import { env } from '../env.js';
import { DOCUMENT_TYPE_LABELS, type Invoice } from '@bon/types/invoices';
import { formatMinorUnits } from '@bon/types/formatting';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

export interface EmailService {
  send(options: SendEmailOptions): Promise<void>;
}

class ResendEmailService implements EmailService {
  private readonly client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  async send(options: SendEmailOptions): Promise<void> {
    const payload: Parameters<typeof this.client.emails.send>[0] = {
      from: env.EMAIL_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
    };
    if (options.attachments && options.attachments.length > 0) {
      payload.attachments = options.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
      }));
    }
    await this.client.emails.send(payload);
  }
}

class ConsoleEmailService implements EmailService {
  async send(options: SendEmailOptions): Promise<void> {
    console.log('[email] Would send:', {
      to: options.to,
      subject: options.subject,
      attachments: options.attachments?.map((a) => a.filename),
    });
  }
}

export const emailService: EmailService = env.RESEND_API_KEY
  ? new ResendEmailService(env.RESEND_API_KEY)
  : new ConsoleEmailService();

export function buildInvoiceEmailHtml(invoice: Invoice, businessName: string): string {
  const docLabel = DOCUMENT_TYPE_LABELS[invoice.documentType] ?? invoice.documentType;
  const total = formatMinorUnits(invoice.totalInclVatMinorUnits);
  const dueDateLine = invoice.dueDate
    ? `<p style="margin:8px 0;color:#555;">תאריך תשלום: ${invoice.dueDate}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,Helvetica,sans-serif;direction:rtl;text-align:right;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="border-bottom:2px solid #228be6;padding-bottom:16px;margin-bottom:20px;">
    <h2 style="margin:0;color:#228be6;">${businessName}</h2>
  </div>
  <p style="margin:8px 0;">שלום${invoice.customerName ? ` ${invoice.customerName}` : ''},</p>
  <p style="margin:8px 0;">מצורפת ${docLabel} מספר <strong>${invoice.documentNumber ?? ''}</strong>.</p>
  <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin:16px 0;">
    <p style="margin:4px 0;"><strong>סכום לתשלום:</strong> ${total}</p>
    ${dueDateLine}
  </div>
  <p style="margin:8px 0;color:#555;font-size:14px;">המסמך מצורף כקובץ PDF.</p>
  <hr style="border:none;border-top:1px solid #dee2e6;margin:24px 0;">
  <p style="margin:0;color:#999;font-size:12px;">נשלח באמצעות BON — מערכת חשבוניות</p>
</body>
</html>`;
}

export function buildInvoiceEmailSubject(invoice: Invoice, businessName: string): string {
  const docLabel = DOCUMENT_TYPE_LABELS[invoice.documentType] ?? invoice.documentType;
  return `${docLabel} ${invoice.documentNumber ?? ''} מ-${businessName}`;
}
