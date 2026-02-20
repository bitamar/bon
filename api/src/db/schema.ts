import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const businessTypeEnum = pgEnum('business_type', [
  'licensed_dealer',
  'exempt_dealer',
  'limited_company',
]);
export const businessRoleEnum = pgEnum('business_role', ['owner', 'admin', 'user']);
export const invitationStatusEnum = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'declined',
  'expired',
]);
export const taxIdTypeEnum = pgEnum('tax_id_type', [
  'company_id',
  'vat_number',
  'personal_id',
  'none',
]);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  googleId: text('google_id').unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  phone: text('phone').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const businesses = pgTable('businesses', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  businessType: businessTypeEnum('business_type').notNull(),
  registrationNumber: text('registration_number').notNull().unique(),
  vatNumber: text('vat_number'),
  streetAddress: text('street_address').notNull(),
  city: text('city').notNull(),
  postalCode: text('postal_code'),
  phone: text('phone'),
  email: text('email'),
  invoiceNumberPrefix: text('invoice_number_prefix'),
  startingInvoiceNumber: integer('starting_invoice_number').notNull().default(1),
  defaultVatRate: integer('default_vat_rate').notNull().default(1700),
  logoUrl: text('logo_url'),
  isActive: boolean('is_active').notNull().default(true),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

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
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserBusiness: unique().on(table.userId, table.businessId),
  })
);

export const businessInvitations = pgTable(
  'business_invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    email: text('email').notNull(),
    role: businessRoleEnum('role').notNull(),
    status: invitationStatusEnum('status').notNull().default('pending'),
    invitedByUserId: uuid('invited_by_user_id')
      .notNull()
      .references(() => users.id),
    token: text('token').notNull().unique(),
    personalMessage: text('personal_message'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    declinedAt: timestamp('declined_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueBusinessEmail: unique().on(table.businessId, table.email),
  })
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
  invitations: many(businessInvitations),
  customers: many(customers),
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
  invitedByUser: one(users, {
    fields: [userBusinesses.invitedByUserId],
    references: [users.id],
  }),
}));

export const businessInvitationsRelations = relations(businessInvitations, ({ one }) => ({
  business: one(businesses, {
    fields: [businessInvitations.businessId],
    references: [businesses.id],
  }),
  invitedByUser: one(users, {
    fields: [businessInvitations.invitedByUserId],
    references: [users.id],
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
  (table) => ({
    uniqueBusinessTaxId: unique().on(table.businessId, table.taxId),
  })
);

export const customersRelations = relations(customers, ({ one }) => ({
  business: one(businesses, {
    fields: [customers.businessId],
    references: [businesses.id],
  }),
}));
