import { z } from 'zod';
import { listCustomers } from '../../customer-service.js';
import {
  createDraft,
  updateDraft,
  getInvoice,
  finalize,
  enqueueShaamAllocation,
} from '../../invoice-service.js';
import { findBusinessById } from '../../../repositories/business-repository.js';
import {
  upsertPendingAction,
  findPendingAction,
  deletePendingAction,
} from '../../../repositories/whatsapp-repository.js';
import { AppError } from '../../../lib/app-error.js';
import type { ToolContext, ToolDefinition, ToolHandler, ToolRegistry } from '../types.js';
import { registerTool } from '../types.js';
import type { LineItemInput } from '@bon/types/invoices';

// ── Helpers ──

const NO_BUSINESS_MSG = 'יש לבחור עסק קודם. השתמשו בכלי select_business.';

function requireBusiness(context: ToolContext): string | null {
  return context.businessId;
}

function formatCurrency(minorUnits: number): string {
  const abs = Math.abs(minorUnits);
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  const formatted = whole.toLocaleString('he-IL');
  const sign = minorUnits < 0 ? '-' : '';
  return cents === 0
    ? `${sign}₪${formatted}`
    : `${sign}₪${formatted}.${String(cents).padStart(2, '0')}`;
}

function shekelToMinorUnits(shekelAmount: number): number {
  return Math.round(Number((shekelAmount * 100).toPrecision(15)));
}

// ── Definitions ──

const findCustomerDefinition: ToolDefinition = {
  name: 'find_customer',
  description: 'חפש לקוח לפי שם או מספר מזהה',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'שם הלקוח או מספר מזהה' },
    },
    required: ['query'],
  },
};

const createDraftInvoiceDefinition: ToolDefinition = {
  name: 'create_draft_invoice',
  description: 'צור טיוטת חשבונית חדשה',
  input_schema: {
    type: 'object',
    properties: {
      customerId: { type: 'string', description: 'מזהה הלקוח' },
      documentType: {
        type: 'string',
        enum: ['tax_invoice', 'tax_invoice_receipt', 'receipt'],
        description: 'סוג מסמך (ברירת מחדל: חשבונית מס)',
      },
    },
    required: ['customerId'],
  },
};

const addLineItemDefinition: ToolDefinition = {
  name: 'add_line_item',
  description: 'הוסף פריט לחשבונית',
  input_schema: {
    type: 'object',
    properties: {
      invoiceId: { type: 'string', description: 'מזהה החשבונית' },
      description: { type: 'string', description: 'תיאור הפריט' },
      quantity: { type: 'number', description: 'כמות' },
      unitPrice: { type: 'number', description: 'מחיר ליחידה בשקלים' },
      discountPercent: { type: 'number', description: 'אחוז הנחה (אופציונלי)' },
    },
    required: ['invoiceId', 'description', 'quantity', 'unitPrice'],
  },
};

const removeLineItemDefinition: ToolDefinition = {
  name: 'remove_line_item',
  description: 'הסר פריט מחשבונית',
  input_schema: {
    type: 'object',
    properties: {
      invoiceId: { type: 'string', description: 'מזהה החשבונית' },
      position: { type: 'number', description: 'מספר הפריט (מתחיל מ-0)' },
    },
    required: ['invoiceId', 'position'],
  },
};

const getDraftSummaryDefinition: ToolDefinition = {
  name: 'get_draft_summary',
  description: 'הצג סיכום טיוטת חשבונית',
  input_schema: {
    type: 'object',
    properties: {
      invoiceId: { type: 'string', description: 'מזהה החשבונית' },
    },
    required: ['invoiceId'],
  },
};

const requestConfirmationDefinition: ToolDefinition = {
  name: 'request_confirmation',
  description: 'בקש אישור מהמשתמש לפני הפקת חשבונית',
  input_schema: {
    type: 'object',
    properties: {
      invoiceId: { type: 'string', description: 'מזהה החשבונית' },
    },
    required: ['invoiceId'],
  },
};

const finalizeInvoiceDefinition: ToolDefinition = {
  name: 'finalize_invoice',
  description: 'הפק חשבונית סופית (רק אחרי אישור המשתמש)',
  input_schema: {
    type: 'object',
    properties: {
      invoiceId: { type: 'string', description: 'מזהה החשבונית' },
      vatExemptionReason: { type: 'string', description: 'סיבת פטור ממע"מ (אופציונלי)' },
    },
    required: ['invoiceId'],
  },
};

// ── Input Schemas ──

const findCustomerInputSchema = z.object({ query: z.string() });
const createDraftInputSchema = z.object({
  customerId: z.string(),
  documentType: z.enum(['tax_invoice', 'tax_invoice_receipt', 'receipt']).default('tax_invoice'),
});
const addLineItemInputSchema = z.object({
  invoiceId: z.string(),
  description: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  discountPercent: z.number().min(0).max(100).default(0),
});
const removeLineItemInputSchema = z.object({
  invoiceId: z.string(),
  position: z.number().int().nonnegative(),
});
const invoiceIdInputSchema = z.object({ invoiceId: z.string() });
const finalizeInputSchema = z.object({
  invoiceId: z.string(),
  vatExemptionReason: z.string().optional(),
});
const pendingActionPayloadSchema = z.object({
  invoiceId: z.string(),
  draftRevision: z.string(),
});

// ── Handlers ──

const findCustomerHandler: ToolHandler = async (input: unknown, context: ToolContext) => {
  const businessId = requireBusiness(context);
  if (!businessId) return NO_BUSINESS_MSG;

  const parsed = findCustomerInputSchema.safeParse(input);
  if (!parsed.success) return 'שגיאה: נדרש שדה query לחיפוש.';

  const result = await listCustomers(businessId, parsed.data.query, true, 5);
  if (result.customers.length === 0) {
    return 'לא נמצאו לקוחות. נסו לחפש עם שם אחר, או צרו לקוח חדש דרך האפליקציה.';
  }

  return JSON.stringify(
    result.customers.map((c) => ({ id: c.id, name: c.name, taxId: c.taxId, city: c.city }))
  );
};

const createDraftInvoiceHandler: ToolHandler = async (input: unknown, context: ToolContext) => {
  const businessId = requireBusiness(context);
  if (!businessId) return NO_BUSINESS_MSG;

  const parsed = createDraftInputSchema.safeParse(input);
  if (!parsed.success) return 'שגיאה: נדרש מזהה לקוח (customerId).';

  try {
    const result = await createDraft(businessId, {
      documentType: parsed.data.documentType,
      customerId: parsed.data.customerId,
    });
    return JSON.stringify({
      invoiceId: result.invoice.id,
      documentType: result.invoice.documentType,
    });
  } catch (err) {
    if (err instanceof AppError) return `שגיאה: ${err.message}`;
    throw err;
  }
};

const addLineItemHandler: ToolHandler = async (input: unknown, context: ToolContext) => {
  const businessId = requireBusiness(context);
  if (!businessId) return NO_BUSINESS_MSG;

  const parsed = addLineItemInputSchema.safeParse(input);
  if (!parsed.success) return 'שגיאה: נדרשים שדות invoiceId, description, quantity, unitPrice.';

  // Look up business default VAT rate
  const business = await findBusinessById(businessId);
  if (!business) return 'שגיאה: עסק לא נמצא.';

  // Load existing items
  let existingInvoice;
  try {
    existingInvoice = await getInvoice(businessId, parsed.data.invoiceId);
  } catch (err) {
    if (err instanceof AppError) return `שגיאה: חשבונית לא נמצאה.`;
    throw err;
  }

  // Map existing items back to LineItemInput format
  const existingItems: LineItemInput[] = existingInvoice.items.map((item) => ({
    description: item.description,
    catalogNumber: item.catalogNumber ?? undefined,
    quantity: item.quantity,
    unitPriceMinorUnits: item.unitPriceMinorUnits,
    discountPercent: item.discountPercent,
    vatRateBasisPoints: item.vatRateBasisPoints,
    position: item.position,
  }));

  // Build new item
  const newItem: LineItemInput = {
    description: parsed.data.description,
    quantity: parsed.data.quantity,
    unitPriceMinorUnits: shekelToMinorUnits(parsed.data.unitPrice),
    discountPercent: parsed.data.discountPercent,
    vatRateBasisPoints: business.defaultVatRate,
    position: existingItems.length,
  };

  const allItems = [...existingItems, newItem];

  try {
    const result = await updateDraft(businessId, parsed.data.invoiceId, {
      items: allItems,
      expectedUpdatedAt: existingInvoice.invoice.updatedAt,
    });
    const lineTotal = result.items[result.items.length - 1]!.lineTotalMinorUnits;
    return `נוסף: ${parsed.data.description} × ${parsed.data.quantity} = ${formatCurrency(lineTotal)}\nסה"כ כולל מע"מ: ${formatCurrency(result.invoice.totalInclVatMinorUnits)}`;
  } catch (err) {
    if (err instanceof AppError && err.code === 'revision_mismatch') {
      return 'שגיאה: החשבונית שונתה במקביל. נסו שוב.';
    }
    if (err instanceof AppError) return `שגיאה: ${err.message}`;
    throw err;
  }
};

const removeLineItemHandler: ToolHandler = async (input: unknown, context: ToolContext) => {
  const businessId = requireBusiness(context);
  if (!businessId) return NO_BUSINESS_MSG;

  const parsed = removeLineItemInputSchema.safeParse(input);
  if (!parsed.success) return 'שגיאה: נדרשים שדות invoiceId ו-position.';

  let existingInvoice;
  try {
    existingInvoice = await getInvoice(businessId, parsed.data.invoiceId);
  } catch (err) {
    if (err instanceof AppError) return 'שגיאה: חשבונית לא נמצאה.';
    throw err;
  }

  const { position } = parsed.data;
  if (position < 0 || position >= existingInvoice.items.length) {
    return `שגיאה: מספר פריט ${position} לא קיים. יש ${existingInvoice.items.length} פריטים (0-${existingInvoice.items.length - 1}).`;
  }

  const removedItem = existingInvoice.items[position]!;

  // Filter out the item and re-index positions
  const remainingItems: LineItemInput[] = existingInvoice.items
    .filter((_, i) => i !== position)
    .map((item, i) => ({
      description: item.description,
      catalogNumber: item.catalogNumber ?? undefined,
      quantity: item.quantity,
      unitPriceMinorUnits: item.unitPriceMinorUnits,
      discountPercent: item.discountPercent,
      vatRateBasisPoints: item.vatRateBasisPoints,
      position: i,
    }));

  try {
    const result = await updateDraft(businessId, parsed.data.invoiceId, {
      items: remainingItems,
      expectedUpdatedAt: existingInvoice.invoice.updatedAt,
    });
    return `הוסר: ${removedItem.description}\nסה"כ כולל מע"מ: ${formatCurrency(result.invoice.totalInclVatMinorUnits)}`;
  } catch (err) {
    if (err instanceof AppError && err.code === 'revision_mismatch') {
      return 'שגיאה: החשבונית שונתה במקביל. נסו שוב.';
    }
    if (err instanceof AppError) return `שגיאה: ${err.message}`;
    throw err;
  }
};

const getDraftSummaryHandler: ToolHandler = async (input: unknown, context: ToolContext) => {
  const businessId = requireBusiness(context);
  if (!businessId) return NO_BUSINESS_MSG;

  const parsed = invoiceIdInputSchema.safeParse(input);
  if (!parsed.success) return 'שגיאה: נדרש מזהה חשבונית (invoiceId).';

  let invoice;
  try {
    invoice = await getInvoice(businessId, parsed.data.invoiceId);
  } catch (err) {
    if (err instanceof AppError) return 'שגיאה: חשבונית לא נמצאה.';
    throw err;
  }

  const customerName = invoice.invoice.customerName ?? 'לא נבחר לקוח';
  const lines = invoice.items.map(
    (item, i) =>
      `${i}. ${item.description} × ${item.quantity} — ${formatCurrency(item.lineTotalMinorUnits)}`
  );

  return [
    `חשבונית טיוטה:`,
    `לקוח: ${customerName}`,
    ...lines,
    `מע"מ: ${formatCurrency(invoice.invoice.vatMinorUnits)}`,
    `סה"כ: ${formatCurrency(invoice.invoice.totalInclVatMinorUnits)}`,
  ].join('\n');
};

const requestConfirmationHandler: ToolHandler = async (input: unknown, context: ToolContext) => {
  const businessId = requireBusiness(context);
  if (!businessId) return NO_BUSINESS_MSG;

  const parsed = invoiceIdInputSchema.safeParse(input);
  if (!parsed.success) return 'שגיאה: נדרש מזהה חשבונית (invoiceId).';

  let invoice;
  try {
    invoice = await getInvoice(businessId, parsed.data.invoiceId);
  } catch (err) {
    if (err instanceof AppError) return 'שגיאה: חשבונית לא נמצאה.';
    throw err;
  }

  if (invoice.items.length === 0) {
    return 'שגיאה: לא ניתן להפיק חשבונית ללא פריטים.';
  }

  // Upsert pending action with 10-minute expiry, including draft revision to detect mid-approval edits
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await upsertPendingAction({
    conversationId: context.conversationId,
    actionType: 'finalize_invoice',
    payload: JSON.stringify({
      invoiceId: parsed.data.invoiceId,
      draftRevision: invoice.invoice.updatedAt,
    }),
    expiresAt,
  });

  const customerName = invoice.invoice.customerName ?? 'לא נבחר לקוח';
  const lines = invoice.items.map(
    (item, i) =>
      `${i}. ${item.description} × ${item.quantity} — ${formatCurrency(item.lineTotalMinorUnits)}`
  );

  return [
    `חשבונית טיוטה:`,
    `לקוח: ${customerName}`,
    ...lines,
    `מע"מ: ${formatCurrency(invoice.invoice.vatMinorUnits)}`,
    `סה"כ: ${formatCurrency(invoice.invoice.totalInclVatMinorUnits)}`,
    '',
    'להפיק? (כן/לא)',
  ].join('\n');
};

const FINALIZE_ROLES = new Set(['owner', 'admin']);

function canFinalize(role: string | null): boolean {
  return !!role && FINALIZE_ROLES.has(role);
}

async function verifyDraftRevision(
  businessId: string,
  invoiceId: string,
  draftRevision: string
): Promise<string | null> {
  let currentInvoice;
  try {
    currentInvoice = await getInvoice(businessId, invoiceId);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 404) {
      return 'שגיאה: חשבונית לא נמצאה.';
    }
    throw err;
  }
  if (currentInvoice.invoice.updatedAt !== draftRevision) {
    return 'החשבונית שונתה מאז האישור. יש לבקש אישור מחדש.';
  }
  return null;
}

async function handlePostFinalize(
  result: { needsAllocation: boolean },
  context: ToolContext,
  businessId: string,
  invoiceId: string,
  pendingActionId: string
): Promise<void> {
  try {
    if (result.needsAllocation) {
      if (context.boss) {
        enqueueShaamAllocation(context.boss, businessId, invoiceId, context.logger);
      } else {
        context.logger.warn(
          { businessId, invoiceId },
          'SHAAM allocation needed but job queue (boss) is unavailable — allocation must be retried manually'
        );
      }
    }
    await deletePendingAction(pendingActionId);
  } catch (postCommitErr) {
    context.logger.error(
      { err: postCommitErr, businessId, invoiceId, pendingActionId },
      'Post-finalize cleanup failed (invoice was already issued successfully)'
    );
  }
}

const finalizeInvoiceHandler: ToolHandler = async (input: unknown, context: ToolContext) => {
  const businessId = requireBusiness(context);
  if (!businessId) return NO_BUSINESS_MSG;

  if (!canFinalize(context.userRole)) {
    return 'אין לך הרשאה להפיק חשבוניות. פנה לבעלים או מנהל העסק.';
  }

  const parsed = finalizeInputSchema.safeParse(input);
  if (!parsed.success) return 'שגיאה: נדרש מזהה חשבונית (invoiceId).';

  const pendingAction = await findPendingAction(context.conversationId, 'finalize_invoice');
  if (!pendingAction) {
    return 'לא נמצא אישור תקף. יש לבקש אישור מחדש.';
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(pendingAction.payload) as unknown;
  } catch {
    return 'לא נמצא אישור תקף. יש לבקש אישור מחדש.';
  }
  const pendingPayload = pendingActionPayloadSchema.safeParse(rawPayload);
  if (!pendingPayload.success) {
    return 'לא נמצא אישור תקף. יש לבקש אישור מחדש.';
  }
  if (pendingPayload.data.invoiceId !== parsed.data.invoiceId) {
    return 'לא נמצא אישור תקף. יש לבקש אישור מחדש.';
  }

  const revisionError = await verifyDraftRevision(
    businessId,
    parsed.data.invoiceId,
    pendingPayload.data.draftRevision
  );
  if (revisionError) return revisionError;

  try {
    const result = await finalize(businessId, parsed.data.invoiceId, {
      vatExemptionReason: parsed.data.vatExemptionReason,
    });

    await handlePostFinalize(result, context, businessId, parsed.data.invoiceId, pendingAction.id);

    const docNumber = result.invoice.documentNumber ?? '';
    return `חשבונית ${docNumber} הופקה בהצלחה! ✓\nסכום: ${formatCurrency(result.invoice.totalInclVatMinorUnits)}`;
  } catch (err) {
    if (err instanceof AppError && err.code === 'missing_vat_exemption_reason') {
      return 'החשבונית ללא מע"מ — נדרשת סיבת פטור. מה הסיבה?';
    }
    if (err instanceof AppError) return `שגיאה: ${err.message}`;
    throw err;
  }
};

// ── Registration ──

export function registerInvoiceTools(registry: ToolRegistry): void {
  registerTool(registry, findCustomerDefinition, findCustomerHandler);
  registerTool(registry, createDraftInvoiceDefinition, createDraftInvoiceHandler);
  registerTool(registry, addLineItemDefinition, addLineItemHandler);
  registerTool(registry, removeLineItemDefinition, removeLineItemHandler);
  registerTool(registry, getDraftSummaryDefinition, getDraftSummaryHandler);
  registerTool(registry, requestConfirmationDefinition, requestConfirmationHandler);
  registerTool(registry, finalizeInvoiceDefinition, finalizeInvoiceHandler);
}
