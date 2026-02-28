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
} from '../repositories/user-business-repository.js';
import {
  conflict,
  extractConstraintName,
  forbidden,
  isErrorWithCode,
  notFound,
} from '../lib/app-error.js';
import {
  businessSchema,
  businessResponseSchema,
  businessListResponseSchema,
  type BusinessRole,
} from '@bon/types/businesses';
import { STANDARD_VAT_RATE_BP } from '@bon/types/vat';

export type BusinessDto = z.infer<typeof businessSchema>;
export type BusinessResponse = z.infer<typeof businessResponseSchema>;
export type BusinessListResponse = z.infer<typeof businessListResponseSchema>;

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
      defaultVatRate:
        input.businessType === 'exempt_dealer' ? 0 : (input.defaultVatRate ?? STANDARD_VAT_RATE_BP),
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
  const updates: Partial<BusinessInsert> = {
    updatedAt: now,
    // Non-nullable fields: only update when a real value is provided
    ...(input.name != null && { name: input.name }),
    ...(input.defaultVatRate != null && { defaultVatRate: input.defaultVatRate }),
    ...(input.isActive != null && {
      isActive: input.isActive,
      deletedAt: input.isActive ? null : now,
    }),
    // Nullable fields: update whenever the key is present (including null to clear)
    ...(input.vatNumber !== undefined && { vatNumber: input.vatNumber }),
    ...(input.streetAddress !== undefined && { streetAddress: input.streetAddress }),
    ...(input.city !== undefined && { city: input.city }),
    ...(input.postalCode !== undefined && { postalCode: input.postalCode }),
    ...(input.phone !== undefined && { phone: input.phone }),
    ...(input.email !== undefined && { email: input.email }),
    ...(input.invoiceNumberPrefix !== undefined && {
      invoiceNumberPrefix: input.invoiceNumberPrefix,
    }),
    ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
  };

  const business = await updateBusiness(businessId, updates);

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
