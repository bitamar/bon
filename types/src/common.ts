import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const nonEmptyString = z.string().trim().min(1).max(255);

export const nullableString = z.union([nonEmptyString, z.literal(null)]);

export const optionalNullableString = nullableString.optional();

export const nullableEmail = z.union([z.string().trim().email(), z.literal(null)]);

export const dateString = z.string().trim().date();
export const nullableDateString = z.union([dateString, z.literal(null)]);

export const nullableUuid = z.union([uuidSchema, z.literal(null)]);
export const nullableInt = z.union([z.number().int(), z.literal(null)]);

export const okResponseSchema = z.object({ ok: z.literal(true) });

export const nullableNumber = z.union([z.number().finite(), z.literal(null)]);

export const isoDateTime = z
  .string()
  .trim()
  .datetime({ offset: true });

export const nullableIsoDateTime = z.union([isoDateTime, z.literal(null)]);
