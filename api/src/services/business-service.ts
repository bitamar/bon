import { z } from 'zod';
import {
  insertBusiness,
  findBusinessById,
  updateBusiness,
  type BusinessRecord,
  type BusinessInsert,
} from '../repositories/business-repository.js';
import {
  insertUserBusiness,
  findBusinessesForUser,
  findTeamMembers,
  deleteUserBusiness,
  findUserBusiness,
} from '../repositories/user-business-repository.js';
import { conflict, forbidden, isErrorWithCode, notFound } from '../lib/app-error.js';
import {
  businessSchema,
  businessResponseSchema,
  businessListResponseSchema,
  teamListResponseSchema,
  type BusinessRole,
} from '@bon/types/businesses';

function extractConstraintName(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const constraint = (err as Record<string, unknown>)['constraint'];
  if (typeof constraint === 'string') return constraint;
  if ('cause' in err) return extractConstraintName((err as { cause: unknown }).cause);
  return undefined;
}

export type BusinessDto = z.infer<typeof businessSchema>;
export type BusinessResponse = z.infer<typeof businessResponseSchema>;
export type BusinessListResponse = z.infer<typeof businessListResponseSchema>;
export type TeamListResponse = z.infer<typeof teamListResponseSchema>;

export type CreateBusinessInput = {
  name: string;
  businessType: 'licensed_dealer' | 'exempt_dealer' | 'limited_company';
  registrationNumber: string;
  vatNumber?: string | undefined;
  streetAddress?: string | undefined;
  city?: string | undefined;
  postalCode?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  invoiceNumberPrefix?: string | undefined;
  startingInvoiceNumber?: number | undefined;
  defaultVatRate?: number | undefined;
};

export type UpdateBusinessInput = {
  name?: string | null | undefined;
  vatNumber?: string | null | undefined;
  streetAddress?: string | null | undefined;
  city?: string | null | undefined;
  postalCode?: string | null | undefined;
  phone?: string | null | undefined;
  email?: string | null | undefined;
  invoiceNumberPrefix?: string | null | undefined;
  defaultVatRate?: number | undefined;
  logoUrl?: string | null | undefined;
  isActive?: boolean | undefined;
};

function serializeBusiness(record: BusinessRecord): BusinessDto {
  return {
    id: record.id,
    name: record.name,
    businessType: record.businessType,
    registrationNumber: record.registrationNumber,
    vatNumber: record.vatNumber ?? null,
    streetAddress: record.streetAddress ?? null,
    city: record.city ?? null,
    postalCode: record.postalCode ?? null,
    phone: record.phone ?? null,
    email: record.email ?? null,
    invoiceNumberPrefix: record.invoiceNumberPrefix ?? null,
    startingInvoiceNumber: record.startingInvoiceNumber,
    defaultVatRate: record.defaultVatRate,
    logoUrl: record.logoUrl ?? null,
    isActive: record.isActive,
    createdByUserId: record.createdByUserId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function createBusiness(userId: string, input: CreateBusinessInput) {
  const now = new Date();

  try {
    const business = await insertBusiness({
      name: input.name,
      businessType: input.businessType,
      registrationNumber: input.registrationNumber,
      vatNumber: input.vatNumber ?? null,
      streetAddress: input.streetAddress ?? null,
      city: input.city ?? null,
      postalCode: input.postalCode ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      invoiceNumberPrefix: input.invoiceNumberPrefix ?? null,
      startingInvoiceNumber: input.startingInvoiceNumber ?? 1,
      nextInvoiceNumber: input.startingInvoiceNumber ?? 1,
      defaultVatRate: input.businessType === 'exempt_dealer' ? 0 : (input.defaultVatRate ?? 1700),
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });

    if (!business) throw new Error('Failed to create business');

    await insertUserBusiness({
      userId,
      businessId: business.id,
      role: 'owner',
      createdAt: now,
    });

    return {
      business: serializeBusiness(business),
      role: 'owner' as BusinessRole,
    } satisfies BusinessResponse;
  } catch (err: unknown) {
    if (isErrorWithCode(err, '23505')) {
      if (extractConstraintName(err) === 'businesses_registration_number_unique') {
        throw conflict({ code: 'duplicate_registration_number' });
      }
      throw conflict({});
    }
    throw err;
  }
}

export async function getBusinessById(businessId: string, role: BusinessRole) {
  const business = await findBusinessById(businessId);
  if (!business) throw notFound();

  return {
    business: serializeBusiness(business),
    role,
  } satisfies BusinessResponse;
}

export async function updateBusinessById(
  businessId: string,
  role: BusinessRole,
  input: UpdateBusinessInput
) {
  if (role !== 'owner' && role !== 'admin') {
    throw forbidden();
  }

  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };

  // Non-nullable fields: only update when a real value is provided
  if (input.name != null) updates['name'] = input.name;
  if (input.defaultVatRate != null) updates['defaultVatRate'] = input.defaultVatRate;
  if (input.isActive != null) updates['isActive'] = input.isActive;

  // Nullable fields: update whenever the key is present (including null to clear)
  if (input.vatNumber !== undefined) updates['vatNumber'] = input.vatNumber;
  if (input.streetAddress !== undefined) updates['streetAddress'] = input.streetAddress;
  if (input.city !== undefined) updates['city'] = input.city;
  if (input.postalCode !== undefined) updates['postalCode'] = input.postalCode;
  if (input.phone !== undefined) updates['phone'] = input.phone;
  if (input.email !== undefined) updates['email'] = input.email;
  if (input.invoiceNumberPrefix !== undefined)
    updates['invoiceNumberPrefix'] = input.invoiceNumberPrefix;
  if (input.logoUrl !== undefined) updates['logoUrl'] = input.logoUrl;

  const business = await updateBusiness(businessId, updates as Partial<BusinessInsert>);

  if (!business) throw notFound();

  return {
    business: serializeBusiness(business),
    role,
  } satisfies BusinessResponse;
}

export async function listBusinessesForUser(userId: string) {
  const businesses = await findBusinessesForUser(userId);

  return {
    businesses: businesses.map((b) => ({
      id: b.id,
      name: b.name,
      businessType: b.businessType,
      registrationNumber: b.registrationNumber,
      isActive: b.isActive,
      role: b.role,
    })),
  } satisfies BusinessListResponse;
}

export async function listTeamMembers(businessId: string) {
  const members = await findTeamMembers(businessId);

  return {
    team: members.map((m) => ({
      userId: m.userId,
      name: m.name ?? null,
      email: m.email,
      avatarUrl: m.avatarUrl ?? null,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    })),
  } satisfies TeamListResponse;
}

export async function removeTeamMember(
  businessId: string,
  targetUserId: string,
  actorRole: BusinessRole
) {
  if (actorRole !== 'owner' && actorRole !== 'admin') {
    throw forbidden();
  }

  const targetMember = await findUserBusiness(targetUserId, businessId);
  if (!targetMember) {
    throw notFound();
  }

  if (targetMember.role === 'owner') {
    throw forbidden({ code: 'cannot_remove_owner' });
  }

  if (actorRole === 'admin' && targetMember.role === 'admin') {
    throw forbidden({ code: 'cannot_remove_admin' });
  }

  await deleteUserBusiness(targetUserId, businessId);
}
