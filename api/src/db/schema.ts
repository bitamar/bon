import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { STANDARD_VAT_RATE_BP, DEFAULT_CURRENCY } from '@bon/types/vat';
import { BUSINESS_TYPES, BUSINESS_ROLES } from '@bon/types/businesses';
import { TAX_ID_TYPES } from '@bon/types/customers';
import {
  DOCUMENT_TYPES,
  SEQUENCE_GROUPS,
  INVOICE_STATUSES,
  ALLOCATION_STATUSES,
} from '@bon/types/invoices';
import { PAYMENT_METHODS } from '@bon/types/payments';
import { SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUSES } from '@bon/types/subscriptions';
import { CONVERSATION_STATUSES, MESSAGE_DIRECTIONS, LLM_ROLES } from '@bon/types/whatsapp';

export const businessTypeEnum = pgEnum('business_type', BUSINESS_TYPES);
export const businessRoleEnum = pgEnum('business_role', BUSINESS_ROLES);
export const taxIdTypeEnum = pgEnum('tax_id_type', TAX_ID_TYPES);
export const documentTypeEnum = pgEnum('document_type', DOCUMENT_TYPES);
export const sequenceGroupEnum = pgEnum('sequence_group', SEQUENCE_GROUPS);
export const invoiceStatusEnum = pgEnum('invoice_status', INVOICE_STATUSES);
export const allocationStatusEnum = pgEnum('allocation_status', ALLOCATION_STATUSES);
export const paymentMethodEnum = pgEnum('payment_method', PAYMENT_METHODS);
export const subscriptionPlanEnum = pgEnum('subscription_plan', SUBSCRIPTION_PLANS);
export const subscriptionStatusEnum = pgEnum('subscription_status', SUBSCRIPTION_STATUSES);
export const conversationStatusEnum = pgEnum('conversation_status', CONVERSATION_STATUSES);
export const messageDirectionEnum = pgEnum('message_direction', MESSAGE_DIRECTIONS);
export const llmRoleEnum = pgEnum('llm_role', LLM_ROLES);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  googleId: text('google_id').unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  phone: text('phone'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('session_user_idx').on(table.userId),
    index('session_expires_idx').on(table.expiresAt),
  ]
);

export const businesses = pgTable(
  'businesses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    businessType: businessTypeEnum('business_type').notNull(),
    registrationNumber: text('registration_number').notNull().unique(),
    vatNumber: text('vat_number').unique(),
    streetAddress: text('street_address'),
    city: text('city'),
    postalCode: text('postal_code'),
    phone: text('phone'),
    email: text('email'),
    invoiceNumberPrefix: text('invoice_number_prefix'),
    startingInvoiceNumber: integer('starting_invoice_number').notNull().default(1),
    // stored as basis points: 1700 = 17.00%
    defaultVatRate: integer('default_vat_rate').notNull().default(STANDARD_VAT_RATE_BP),
    logoUrl: text('logo_url'),
    isActive: boolean('is_active').notNull().default(true),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      'businesses_soft_delete_check',
      sql`(${table.isActive} AND ${table.deletedAt} IS NULL) OR (NOT ${table.isActive} AND ${table.deletedAt} IS NOT NULL)`
    ),
  ]
);

export const userBusinesses = pgTable(
  'user_businesses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    role: businessRoleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('user_businesses_user_business_unique').on(table.userId, table.businessId),
    index('user_businesses_business_id_idx').on(table.businessId),
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  userBusinesses: many(userBusinesses),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const businessesRelations = relations(businesses, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [businesses.createdByUserId],
    references: [users.id],
  }),
  userBusinesses: many(userBusinesses),
  customers: many(customers),
  invoices: many(invoices),
  invoiceSequences: many(invoiceSequences),
  shaamCredentials: one(businessShaamCredentials, {
    fields: [businesses.id],
    references: [businessShaamCredentials.businessId],
  }),
  subscription: one(subscriptions, {
    fields: [businesses.id],
    references: [subscriptions.businessId],
  }),
}));

export const userBusinessesRelations = relations(userBusinesses, ({ one }) => ({
  user: one(users, {
    fields: [userBusinesses.userId],
    references: [users.id],
  }),
  business: one(businesses, {
    fields: [userBusinesses.businessId],
    references: [businesses.id],
  }),
}));

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    taxId: text('tax_id'),
    taxIdType: taxIdTypeEnum('tax_id_type').notNull().default('none'),
    isLicensedDealer: boolean('is_licensed_dealer').notNull().default(false),
    email: text('email'),
    phone: text('phone'),
    streetAddress: text('street_address'),
    city: text('city'),
    postalCode: text('postal_code'),
    contactName: text('contact_name'),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('customers_business_id_tax_id_unique')
      .on(table.businessId, table.taxId)
      .where(
        sql.join([table.taxId, sql.raw('is not null and'), table.isActive, sql.raw('= true')])
      ),
    index('customers_business_id_idx').on(table.businessId),
    check(
      'customers_soft_delete_check',
      sql`(${table.isActive} AND ${table.deletedAt} IS NULL) OR (NOT ${table.isActive} AND ${table.deletedAt} IS NOT NULL)`
    ),
  ]
);

export const customersRelations = relations(customers, ({ one, many }) => ({
  business: one(businesses, {
    fields: [customers.businessId],
    references: [businesses.id],
  }),
  invoices: many(invoices),
}));

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),

    // Snapshot of customer at time of finalization (all nullable for draft state)
    customerName: text('customer_name'),
    customerTaxId: text('customer_tax_id'),
    customerAddress: text('customer_address'),
    customerEmail: text('customer_email'),

    documentType: documentTypeEnum('document_type').notNull(),
    status: invoiceStatusEnum('status').notNull().default('draft'),
    isOverdue: boolean('is_overdue').notNull().default(false),
    sequenceNumber: integer('sequence_number'),
    documentNumber: text('document_number'),
    creditedInvoiceId: uuid('credited_invoice_id'),
    sequenceGroup: sequenceGroupEnum('sequence_group'),
    invoiceDate: date('invoice_date', { mode: 'string' })
      .notNull()
      .default(sql.raw('CURRENT_DATE')),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    dueDate: date('due_date', { mode: 'string' }),
    notes: text('notes'),
    internalNotes: text('internal_notes'),
    currency: text('currency').notNull().default(DEFAULT_CURRENCY),
    vatExemptionReason: text('vat_exemption_reason'),
    subtotalMinorUnits: integer('subtotal_minor_units').notNull().default(0),
    discountMinorUnits: integer('discount_minor_units').notNull().default(0),
    totalExclVatMinorUnits: integer('total_excl_vat_minor_units').notNull().default(0),
    vatMinorUnits: integer('vat_minor_units').notNull().default(0),
    totalInclVatMinorUnits: integer('total_incl_vat_minor_units').notNull().default(0),
    allocationStatus: allocationStatusEnum('allocation_status'),
    allocationNumber: text('allocation_number'),
    allocationError: text('allocation_error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.creditedInvoiceId],
      foreignColumns: [table.id],
    }).onDelete('restrict'),
    uniqueIndex('invoices_business_seqgroup_seqnum_unique')
      .on(table.businessId, table.sequenceGroup, table.sequenceNumber)
      .where(sql.join([table.sequenceNumber, sql.raw('is not null')])),
    index('invoices_business_status_idx').on(table.businessId, table.status),
    index('invoices_business_date_idx').on(table.businessId, table.invoiceDate),
    index('invoices_business_customer_idx').on(table.businessId, table.customerId),
    // Partial index for draft-cleanup cron job
    index('invoices_draft_cleanup_idx')
      .on(table.updatedAt)
      .where(sql`${table.status} = 'draft'`),
    // Partial indexes for overdue-detection cron job
    index('invoices_overdue_candidates_idx')
      .on(table.dueDate, table.status)
      .where(
        sql`${table.isOverdue} = false AND ${table.dueDate} IS NOT NULL AND ${table.status} IN ('finalized', 'sent', 'partially_paid')`
      ),
    index('invoices_overdue_reset_idx')
      .on(table.status)
      .where(
        sql`${table.isOverdue} = true AND ${table.status} IN ('paid', 'cancelled', 'credited')`
      ),
    index('invoices_credited_invoice_idx').on(
      table.businessId,
      table.creditedInvoiceId,
      table.documentType
    ),
  ]
);

export const invoiceItems = pgTable(
  'invoice_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    description: text('description').notNull(),
    catalogNumber: text('catalog_number'),
    quantity: numeric('quantity', { precision: 12, scale: 4 }).notNull(),
    unitPriceMinorUnits: integer('unit_price_minor_units').notNull(),
    discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }).notNull().default('0'),
    vatRateBasisPoints: integer('vat_rate_basis_points').notNull(),
    lineTotalMinorUnits: integer('line_total_minor_units').notNull().default(0),
    vatAmountMinorUnits: integer('vat_amount_minor_units').notNull().default(0),
    lineTotalInclVatMinorUnits: integer('line_total_incl_vat_minor_units').notNull().default(0),
  },
  (table) => [unique('invoice_items_invoice_position_unique').on(table.invoiceId, table.position)]
);

export const invoiceSequences = pgTable(
  'invoice_sequences',
  {
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    sequenceGroup: sequenceGroupEnum('sequence_group').notNull(),
    nextNumber: integer('next_number').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.businessId, table.sequenceGroup] })]
);

export const invoicePayments = pgTable(
  'invoice_payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    amountMinorUnits: integer('amount_minor_units').notNull(),
    paidAt: date('paid_at', { mode: 'string' }).notNull(),
    method: paymentMethodEnum('method').notNull(),
    reference: text('reference'),
    notes: text('notes'),
    recordedByUserId: uuid('recorded_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('invoice_payments_amount_positive', sql`${table.amountMinorUnits} > 0`),
    index('invoice_payments_invoice_id_idx').on(table.invoiceId),
  ]
);

export const invoicePaymentsRelations = relations(invoicePayments, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoicePayments.invoiceId],
    references: [invoices.id],
  }),
  recordedByUser: one(users, {
    fields: [invoicePayments.recordedByUserId],
    references: [users.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  business: one(businesses, {
    fields: [invoices.businessId],
    references: [businesses.id],
  }),
  customer: one(customers, {
    fields: [invoices.customerId],
    references: [customers.id],
  }),
  creditedInvoice: one(invoices, {
    fields: [invoices.creditedInvoiceId],
    references: [invoices.id],
  }),
  items: many(invoiceItems),
  payments: many(invoicePayments),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
}));

export const invoiceSequencesRelations = relations(invoiceSequences, ({ one }) => ({
  business: one(businesses, {
    fields: [invoiceSequences.businessId],
    references: [businesses.id],
  }),
}));

// ── SHAAM credentials ──

export const businessShaamCredentials = pgTable('business_shaam_credentials', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'cascade' })
    .unique(),
  encryptedAccessToken: text('encrypted_access_token').notNull(),
  encryptedRefreshToken: text('encrypted_refresh_token').notNull(),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }).notNull(),
  scope: text('scope'),
  needsReauth: boolean('needs_reauth').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const businessShaamCredentialsRelations = relations(businessShaamCredentials, ({ one }) => ({
  business: one(businesses, {
    fields: [businessShaamCredentials.businessId],
    references: [businesses.id],
  }),
}));

// ── SHAAM Audit Log ──

const SHAAM_AUDIT_RESULTS = ['approved', 'rejected', 'deferred', 'error', 'emergency'] as const;
export const shaamAuditResultEnum = pgEnum('shaam_audit_result', SHAAM_AUDIT_RESULTS);

export const shaamAuditLog = pgTable(
  'shaam_audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    requestPayload: text('request_payload').notNull(), // JSON string
    responsePayload: text('response_payload'), // JSON string (null if network error)
    httpStatus: integer('http_status'),
    allocationNumber: text('allocation_number'),
    errorCode: text('error_code'),
    result: shaamAuditResultEnum('result').notNull(),
    attemptNumber: integer('attempt_number').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('shaam_audit_log_invoice_idx').on(table.invoiceId)]
);

export const shaamAuditLogRelations = relations(shaamAuditLog, ({ one }) => ({
  business: one(businesses, {
    fields: [shaamAuditLog.businessId],
    references: [businesses.id],
  }),
  invoice: one(invoices, {
    fields: [shaamAuditLog.invoiceId],
    references: [invoices.id],
  }),
}));

// ── Emergency allocation numbers ──

export const emergencyAllocationNumbers = pgTable(
  'emergency_allocation_numbers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    number: text('number').notNull(),
    used: boolean('used').notNull().default(false),
    usedForInvoiceId: uuid('used_for_invoice_id').references(() => invoices.id, {
      onDelete: 'set null',
    }),
    usedAt: timestamp('used_at', { withTimezone: true }),
    reported: boolean('reported').notNull().default(false),
    reportedAt: timestamp('reported_at', { withTimezone: true }),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('emergency_numbers_business_number_unique').on(table.businessId, table.number),
    index('emergency_numbers_business_available_idx')
      .on(table.businessId, table.used)
      .where(sql`${table.used} = false`),
  ]
);

export const emergencyAllocationNumbersRelations = relations(
  emergencyAllocationNumbers,
  ({ one }) => ({
    business: one(businesses, {
      fields: [emergencyAllocationNumbers.businessId],
      references: [businesses.id],
    }),
    invoice: one(invoices, {
      fields: [emergencyAllocationNumbers.usedForInvoiceId],
      references: [invoices.id],
    }),
  })
);

// ── Subscriptions ──

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'cascade' })
    .unique(),
  plan: subscriptionPlanEnum('plan').notNull(),
  status: subscriptionStatusEnum('status').notNull().default('trialing'),
  meshulamCustomerId: text('meshulam_customer_id'),
  meshulamProcessId: text('meshulam_process_id'),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  business: one(businesses, {
    fields: [subscriptions.businessId],
    references: [businesses.id],
  }),
}));

// ── WhatsApp ──

export const whatsappConversations = pgTable(
  'whatsapp_conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' })
      .unique(),
    phone: text('phone').notNull(),
    activeBusinessId: uuid('active_business_id').references(() => businesses.id, {
      onDelete: 'set null',
    }),
    status: conversationStatusEnum('status').notNull().default('active'),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('whatsapp_conversations_phone_idx').on(table.phone)]
);

export const whatsappConversationsRelations = relations(whatsappConversations, ({ one, many }) => ({
  user: one(users, {
    fields: [whatsappConversations.userId],
    references: [users.id],
  }),
  activeBusiness: one(businesses, {
    fields: [whatsappConversations.activeBusinessId],
    references: [businesses.id],
  }),
  messages: many(whatsappMessages),
  pendingActions: many(whatsappPendingActions),
}));

export const whatsappMessages = pgTable(
  'whatsapp_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => whatsappConversations.id, { onDelete: 'cascade' }),
    twilioSid: text('twilio_sid'),
    direction: messageDirectionEnum('direction').notNull(),
    llmRole: llmRoleEnum('llm_role').notNull(),
    toolName: text('tool_name'),
    toolCallId: text('tool_call_id'),
    body: text('body').notNull(),
    metadata: text('metadata'), // JSON string
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('whatsapp_messages_twilio_sid_unique')
      .on(table.twilioSid)
      .where(sql`${table.twilioSid} IS NOT NULL`),
    index('whatsapp_messages_conversation_created_idx').on(table.conversationId, table.createdAt),
  ]
);

export const whatsappMessagesRelations = relations(whatsappMessages, ({ one }) => ({
  conversation: one(whatsappConversations, {
    fields: [whatsappMessages.conversationId],
    references: [whatsappConversations.id],
  }),
}));

export const whatsappPendingActions = pgTable(
  'whatsapp_pending_actions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => whatsappConversations.id, { onDelete: 'cascade' }),
    actionType: text('action_type').notNull(),
    payload: text('payload').notNull(), // JSON string
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('whatsapp_pending_actions_conv_type_unique').on(
      table.conversationId,
      table.actionType
    ),
  ]
);

export const whatsappPendingActionsRelations = relations(whatsappPendingActions, ({ one }) => ({
  conversation: one(whatsappConversations, {
    fields: [whatsappPendingActions.conversationId],
    references: [whatsappConversations.id],
  }),
}));
