import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const nonEmptyString = z.string().trim().min(1);

export const nullableString = z.union([nonEmptyString, z.literal(null)]);

export const optionalNullableString = nullableString.optional();

export const nullableEmail = z.union([z.string().trim().email(), z.literal(null)]);

export const optionalNullableEmail = nullableEmail.optional();

export const optionalNullableBoolean = z.union([z.boolean(), z.literal(null)]).optional();

export const optionalNullableDateInput = z
  .union([
    z
      .string()
      .trim()
      .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Invalid date format' }),
    z.literal(null),
  ])
  .optional();

export const okResponseSchema = z.object({ ok: z.literal(true) });

export const nullableNumber = z.union([z.number().finite(), z.literal(null)]);

export const optionalNullableNumber = nullableNumber.optional();

export const isoDateTime = z
  .string()
  .trim()
  .datetime({ offset: true });

export const nullableIsoDateTime = z.union([isoDateTime, z.literal(null)]);

export const optionalNullableIsoDateTime = nullableIsoDateTime.optional();
