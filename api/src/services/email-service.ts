import { Resend } from 'resend';
import { env } from '../env.js';
import { AppError } from '../lib/app-error.js';
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
    const result = await this.client.emails.send(payload);
    if (result.error) {
      throw new AppError({
        statusCode: 502,
        code: 'email_provider_error',
        message: `Resend API error: ${result.error.message}`,
      });
    }
  }
}

class ConsoleEmailService implements EmailService {
  async send(options: SendEmailOptions): Promise<void> {
    console.log('[email] Would send:', {
      subject: options.subject,
      recipientsCount: 1,
      attachmentsCount: options.attachments?.length ?? 0,
    });
  }
}

export const emailService: EmailService = env.RESEND_API_KEY
  ? new ResendEmailService(env.RESEND_API_KEY)
  : new ConsoleEmailService();

function escapeHtml(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildInvoiceEmailHtml(invoice: Invoice, businessName: string): string {
  const docLabel = escapeHtml(DOCUMENT_TYPE_LABELS[invoice.documentType] ?? invoice.documentType);
  const total = escapeHtml(formatMinorUnits(invoice.totalInclVatMinorUnits));
  const escapedBusinessName = escapeHtml(businessName);
  const escapedCustomerName = invoice.customerName ? escapeHtml(invoice.customerName) : '';
  const escapedDocNumber = escapeHtml(invoice.documentNumber ?? '');
  const dueDateLine = invoice.dueDate
    ? `<p style="margin:8px 0;color:#555;">תאריך תשלום: ${escapeHtml(invoice.dueDate)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,Helvetica,sans-serif;direction:rtl;text-align:right;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="border-bottom:2px solid #228be6;padding-bottom:16px;margin-bottom:20px;">
    <h2 style="margin:0;color:#228be6;">${escapedBusinessName}</h2>
  </div>
  <p style="margin:8px 0;">שלום${escapedCustomerName ? ` ${escapedCustomerName}` : ''},</p>
  <p style="margin:8px 0;">מצורפת ${docLabel} מספר <strong>${escapedDocNumber}</strong>.</p>
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
