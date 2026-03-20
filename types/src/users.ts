import { z } from 'zod';
import { nullableString, optionalNullableString, uuidSchema } from './common.js';

export const userSchema = z.object({
  id: uuidSchema,
  email: z.string().trim().email(),
  name: nullableString,
  avatarUrl: nullableString,
  phone: nullableString,
  whatsappEnabled: z.boolean(),
});

export const settingsResponseSchema = z.object({
  user: userSchema,
});

export const updateSettingsBodySchema = z
  .object({
    name: optionalNullableString,
    phone: optionalNullableString,
    whatsappEnabled: z.boolean().optional(),
  })
  .strict();

export type User = z.infer<typeof userSchema>;
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;
export type UpdateSettingsBody = z.infer<typeof updateSettingsBodySchema>;
