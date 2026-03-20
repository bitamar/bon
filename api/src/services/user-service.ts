import { z } from 'zod';
import { updateUserById, type UserRecord } from '../repositories/user-repository.js';
import { badRequest, conflict, isErrorWithCode, notFound } from '../lib/app-error.js';
import { settingsResponseSchema, userSchema } from '@bon/types/users';
import { toE164 } from '@bon/types/phone';

export type UserDto = z.infer<typeof userSchema>;
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;

type UpdateSettingsInput = {
  name?: string | null;
  phone?: string | null;
  whatsappEnabled?: boolean | undefined;
};

export function serializeUser(
  record: Pick<UserRecord, 'id' | 'email' | 'name' | 'avatarUrl' | 'phone' | 'whatsappEnabled'>
): UserDto {
  return {
    id: record.id,
    email: record.email,
    name: record.name ?? null,
    avatarUrl: record.avatarUrl ?? null,
    phone: record.phone ?? null,
    whatsappEnabled: record.whatsappEnabled,
  };
}

export function getSettingsFromUser(
  record: Pick<UserRecord, 'id' | 'email' | 'name' | 'avatarUrl' | 'phone' | 'whatsappEnabled'>
) {
  return {
    user: serializeUser(record),
  } satisfies SettingsResponse;
}

export async function updateSettingsForUser(userId: string, input: UpdateSettingsInput) {
  try {
    const updates: Parameters<typeof updateUserById>[1] = { updatedAt: new Date() };
    if (input.name != null) updates.name = input.name;
    if (input.phone !== undefined) {
      if (input.phone === null) {
        updates.phone = null;
      } else {
        try {
          updates.phone = toE164(input.phone);
        } catch {
          throw badRequest({ code: 'invalid_phone', message: 'מספר טלפון לא תקין' });
        }
      }
    }
    if (input.whatsappEnabled !== undefined) updates.whatsappEnabled = input.whatsappEnabled;
    const record = await updateUserById(userId, updates);

    if (!record) throw notFound();

    return getSettingsFromUser(record);
  } catch (err: unknown) {
    if (isErrorWithCode(err, '23505')) {
      throw conflict({ code: 'duplicate_phone', message: 'מספר טלפון זה כבר בשימוש' });
    }
    throw err;
  }
}
