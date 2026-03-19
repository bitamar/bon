import type { InvoiceStatus } from '@bon/types/invoices';

export const INVOICE_STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string }> = {
  draft: { label: 'טיוטה', color: 'gray' },
  finalized: { label: 'הופקה', color: 'blue' },
  sending: { label: 'שולח...', color: 'cyan' },
  sent: { label: 'נשלחה', color: 'violet' },
  paid: { label: 'שולמה', color: 'green' },
  partially_paid: { label: 'שולמה חלקית', color: 'yellow' },
  cancelled: { label: 'בוטלה', color: 'red' },
  credited: { label: 'זוכתה', color: 'orange' },
};
