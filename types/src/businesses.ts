import { z } from 'zod';
import { isoDateTime, nonEmptyString, nullableString, optionalNullableString, uuidSchema } from './common.js';

export const businessTypeSchema = z.enum(['licensed_dealer', 'exempt_dealer', 'limited_company']);

export const businessRoleSchema = z.enum(['owner', 'admin', 'user']);

export const registrationNumberSchema = z.string().trim().length(9).regex(/^\d{9}$/);

export const postalCodeSchema = z.string().trim().length(7).regex(/^\d{7}$/);

export const israeliPhoneSchema = z.string().trim().min(9).max(10).regex(/^0[2-9]\d{7,8}$/);

export const businessSchema = z.object({
  id: uuidSchema,
  name: nonEmptyString,
  businessType: businessTypeSchema,
  registrationNumber: registrationNumberSchema,
  vatNumber: nullableString,
  streetAddress: nullableString,
  city: nullableString,
  postalCode: nullableString,
  phone: nullableString,
  email: nullableString,
  invoiceNumberPrefix: nullableString,
  startingInvoiceNumber: z.number().int().positive(),
  defaultVatRate: z.number().int().min(0).max(10000),
  logoUrl: nullableString,
  isActive: z.boolean(),
  createdByUserId: uuidSchema,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const createBusinessBodySchema = z
  .object({
    name: nonEmptyString,
    businessType: businessTypeSchema,
    registrationNumber: registrationNumberSchema,
    vatNumber: registrationNumberSchema.optional(),
    streetAddress: nonEmptyString.optional(),
    city: nonEmptyString.optional(),
    postalCode: postalCodeSchema.optional(),
    phone: israeliPhoneSchema.optional(),
    email: z.string().trim().email().optional(),
    invoiceNumberPrefix: nonEmptyString.optional(),
    startingInvoiceNumber: z.number().int().positive().optional(),
    defaultVatRate: z.number().int().min(0).max(10000).optional(),
  })
  .strict();

export const updateBusinessBodySchema = z
  .object({
    name: optionalNullableString,
    vatNumber: z.union([registrationNumberSchema, z.literal(null)]).optional(),
    streetAddress: optionalNullableString,
    city: optionalNullableString,
    postalCode: z.union([postalCodeSchema, z.literal(null)]).optional(),
    phone: z.union([israeliPhoneSchema, z.literal(null)]).optional(),
    email: z.union([z.string().trim().email(), z.literal(null)]).optional(),
    invoiceNumberPrefix: optionalNullableString,
    defaultVatRate: z.number().int().min(0).max(10000).optional(),
    logoUrl: optionalNullableString,
    isActive: z.boolean().optional(),
  })
  .strict();

export const businessResponseSchema = z.object({
  business: businessSchema,
  role: businessRoleSchema,
});

export const businessListItemSchema = z.object({
  id: uuidSchema,
  name: nonEmptyString,
  businessType: businessTypeSchema,
  registrationNumber: registrationNumberSchema,
  isActive: z.boolean(),
  role: businessRoleSchema,
});

export const businessListResponseSchema = z.object({
  businesses: z.array(businessListItemSchema),
});

export const teamMemberSchema = z.object({
  userId: uuidSchema,
  name: nullableString,
  email: z.string().trim().email(),
  avatarUrl: nullableString,
  role: businessRoleSchema,
  joinedAt: isoDateTime,
});

export const teamListResponseSchema = z.object({
  team: z.array(teamMemberSchema),
});

export const businessIdParamSchema = z.object({
  businessId: uuidSchema,
});

export const teamMemberParamSchema = z.object({
  businessId: uuidSchema,
  userId: uuidSchema,
});

export type BusinessType = z.infer<typeof businessTypeSchema>;
export type BusinessRole = z.infer<typeof businessRoleSchema>;
export type Business = z.infer<typeof businessSchema>;
export type CreateBusinessBody = z.infer<typeof createBusinessBodySchema>;
export type UpdateBusinessBody = z.infer<typeof updateBusinessBodySchema>;
export type BusinessResponse = z.infer<typeof businessResponseSchema>;
export type BusinessListItem = z.infer<typeof businessListItemSchema>;
export type BusinessListResponse = z.infer<typeof businessListResponseSchema>;
export type TeamMember = z.infer<typeof teamMemberSchema>;
export type TeamListResponse = z.infer<typeof teamListResponseSchema>;
export type BusinessIdParam = z.infer<typeof businessIdParamSchema>;
export type TeamMemberParam = z.infer<typeof teamMemberParamSchema>;
