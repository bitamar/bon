import { z } from 'zod';
import {
  isoDateTime,
  nonEmptyString,
  nullableIsoDateTime,
  nullableString,
  optionalNullableString,
  uuidSchema,
} from './common.js';
import { israeliPhoneSchema, postalCodeSchema } from './businesses.js';
import { validateIsraeliId } from './validation.js';

export const taxIdTypeSchema = z.enum(['company_id', 'vat_number', 'personal_id', 'none']);

export const customerSchema = z.object({
  id: uuidSchema,
  businessId: uuidSchema,
  name: nonEmptyString,
  taxId: nullableString,
  taxIdType: taxIdTypeSchema,
  isLicensedDealer: z.boolean(),
  email: nullableString,
  phone: nullableString,
  streetAddress: nullableString,
  city: nullableString,
  postalCode: nullableString,
  contactName: nullableString,
  notes: nullableString,
  isActive: z.boolean(),
  deletedAt: nullableIsoDateTime,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const createCustomerBodySchema = z
  .object({
    name: nonEmptyString,
    taxId: z.string().trim().regex(/^\d{9}$/).optional(),
    taxIdType: taxIdTypeSchema.optional(),
    isLicensedDealer: z.boolean().optional(),
    email: z.string().trim().email().optional(),
    phone: israeliPhoneSchema.optional(),
    streetAddress: nonEmptyString.optional(),
    city: nonEmptyString.optional(),
    postalCode: postalCodeSchema.optional(),
    contactName: nonEmptyString.optional(),
    notes: z.string().trim().optional(),
  })
  .strict()
  .refine((data) => !data.isLicensedDealer || !!data.taxId, {
    message: 'עוסק מורשה חייב מספר מזהה (ח.פ./ע.מ.)',
    path: ['taxId'],
  })
  .superRefine((data, ctx) => {
    if (
      data.taxId &&
      data.taxIdType &&
      data.taxIdType !== 'none' &&
      !validateIsraeliId(data.taxId)
    ) {
      const msg =
        data.taxIdType === 'personal_id' ? 'מספר ת.ז. לא תקין' : 'מספר מזהה לא תקין (ספרת ביקורת)';
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg, path: ['taxId'] });
    }
  });

export const updateCustomerBodySchema = z
  .object({
    name: nonEmptyString.optional(),
    taxId: z.union([z.string().trim().regex(/^\d{9}$/), z.literal(null)]).optional(),
    taxIdType: z.union([taxIdTypeSchema, z.literal(null)]).optional(),
    isLicensedDealer: z.boolean().optional(),
    email: z.union([z.string().trim().email(), z.literal(null)]).optional(),
    phone: z.union([israeliPhoneSchema, z.literal(null)]).optional(),
    streetAddress: optionalNullableString,
    city: optionalNullableString,
    postalCode: z.union([postalCodeSchema, z.literal(null)]).optional(),
    contactName: optionalNullableString,
    notes: z.union([z.string().trim(), z.literal(null)]).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => !data.isLicensedDealer || data.taxId !== null, {
    message: 'עוסק מורשה חייב מספר מזהה (ח.פ./ע.מ.)',
    path: ['taxId'],
  })
  .superRefine((data, ctx) => {
    if (
      data.taxId &&
      data.taxIdType &&
      data.taxIdType !== 'none' &&
      !validateIsraeliId(data.taxId)
    ) {
      const msg =
        data.taxIdType === 'personal_id' ? 'מספר ת.ז. לא תקין' : 'מספר מזהה לא תקין (ספרת ביקורת)';
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg, path: ['taxId'] });
    }
  });

export const customerListItemSchema = z.object({
  id: uuidSchema,
  name: nonEmptyString,
  taxId: nullableString,
  taxIdType: taxIdTypeSchema,
  isLicensedDealer: z.boolean(),
  city: nullableString,
  email: nullableString,
  streetAddress: nullableString,
  isActive: z.boolean(),
});

export const customerResponseSchema = z.object({
  customer: customerSchema,
});

export const customerListResponseSchema = z.object({
  customers: z.array(customerListItemSchema),
});

export const customerParamSchema = z.object({
  businessId: uuidSchema,
});

export const customerIdParamSchema = z.object({
  businessId: uuidSchema,
  customerId: uuidSchema,
});

export const customerQuerySchema = z.object({
  q: z.string().trim().optional(),
  active: z.enum(['true', 'false']).optional(),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().min(1).max(200))
    .optional(),
});

export type TaxIdType = z.infer<typeof taxIdTypeSchema>;
export type Customer = z.infer<typeof customerSchema>;
export type CreateCustomerBody = z.infer<typeof createCustomerBodySchema>;
export type UpdateCustomerBody = z.infer<typeof updateCustomerBodySchema>;
export type CustomerListItem = z.infer<typeof customerListItemSchema>;
export type CustomerResponse = z.infer<typeof customerResponseSchema>;
export type CustomerListResponse = z.infer<typeof customerListResponseSchema>;
export type CustomerIdParam = z.infer<typeof customerIdParamSchema>;
