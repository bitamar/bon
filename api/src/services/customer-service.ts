import {
  insertCustomer,
  findCustomerById,
  findCustomerByTaxId,
  updateCustomer,
  searchCustomers,
  type CustomerRecord,
  type CustomerInsert,
} from '../repositories/customer-repository.js';
import { conflict, extractConstraintName, isErrorWithCode, notFound } from '../lib/app-error.js';
import {
  type Customer,
  type CustomerResponse,
  type CustomerListResponse,
} from '@bon/types/customers';

export type CustomerDto = Customer;

function serializeCustomer(record: CustomerRecord): CustomerDto {
  return {
    id: record.id,
    businessId: record.businessId,
    name: record.name,
    taxId: record.taxId ?? null,
    taxIdType: record.taxIdType,
    isLicensedDealer: record.isLicensedDealer,
    email: record.email ?? null,
    phone: record.phone ?? null,
    streetAddress: record.streetAddress ?? null,
    city: record.city ?? null,
    postalCode: record.postalCode ?? null,
    contactName: record.contactName ?? null,
    notes: record.notes ?? null,
    isActive: record.isActive,
    deletedAt: record.deletedAt ? record.deletedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export type CreateCustomerInput = {
  name: string;
  taxId?: string | undefined;
  taxIdType?: 'company_id' | 'vat_number' | 'personal_id' | 'none' | undefined;
  isLicensedDealer?: boolean | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  streetAddress?: string | undefined;
  city?: string | undefined;
  postalCode?: string | undefined;
  contactName?: string | undefined;
  notes?: string | undefined;
};

export type UpdateCustomerInput = {
  name?: string | undefined;
  taxId?: string | null | undefined;
  taxIdType?: 'company_id' | 'vat_number' | 'personal_id' | 'none' | null | undefined;
  isLicensedDealer?: boolean | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  streetAddress?: string | null | undefined;
  city?: string | null | undefined;
  postalCode?: string | null | undefined;
  contactName?: string | null | undefined;
  notes?: string | null | undefined;
  isActive?: boolean | undefined;
};

async function throwDuplicateTaxIdConflict(
  businessId: string,
  taxId: string | null
): Promise<never> {
  let details: { existingCustomerId: string; existingCustomerName: string } | undefined;

  if (taxId) {
    const existing = await findCustomerByTaxId(businessId, taxId);
    if (existing) {
      details = { existingCustomerId: existing.id, existingCustomerName: existing.name };
    }
  }

  throw conflict({ code: 'duplicate_tax_id', details });
}

export async function createCustomer(businessId: string, input: CreateCustomerInput) {
  const now = new Date();

  try {
    const customer = await insertCustomer({
      businessId,
      name: input.name,
      taxId: input.taxId ?? null,
      taxIdType: input.taxIdType ?? 'none',
      isLicensedDealer: input.isLicensedDealer ?? false,
      email: input.email ?? null,
      phone: input.phone ?? null,
      streetAddress: input.streetAddress ?? null,
      city: input.city ?? null,
      postalCode: input.postalCode ?? null,
      contactName: input.contactName ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    });

    if (!customer) throw new Error('Failed to create customer');

    return { customer: serializeCustomer(customer) } satisfies CustomerResponse;
  } catch (err: unknown) {
    if (isErrorWithCode(err, '23505')) {
      const constraintName = extractConstraintName(err);
      if (!constraintName || constraintName === 'customers_business_id_tax_id_unique') {
        await throwDuplicateTaxIdConflict(businessId, input.taxId ?? null);
      }
      throw conflict({});
    }
    throw err;
  }
}

export async function getCustomerById(businessId: string, customerId: string) {
  const customer = await findCustomerById(customerId, businessId);
  if (!customer) throw notFound();

  return { customer: serializeCustomer(customer) } satisfies CustomerResponse;
}

function buildCustomerUpdates(input: UpdateCustomerInput, now: Date): Partial<CustomerInsert> {
  return {
    updatedAt: now,
    ...(input.name != null && { name: input.name }),
    ...(input.taxId !== undefined && { taxId: input.taxId }),
    ...(input.taxIdType !== undefined && { taxIdType: input.taxIdType ?? 'none' }),
    ...(input.isLicensedDealer != null && { isLicensedDealer: input.isLicensedDealer }),
    ...(input.email !== undefined && { email: input.email }),
    ...(input.phone !== undefined && { phone: input.phone }),
    ...(input.streetAddress !== undefined && { streetAddress: input.streetAddress }),
    ...(input.city !== undefined && { city: input.city }),
    ...(input.postalCode !== undefined && { postalCode: input.postalCode }),
    ...(input.contactName !== undefined && { contactName: input.contactName }),
    ...(input.notes !== undefined && { notes: input.notes }),
    ...(input.isActive != null && {
      isActive: input.isActive,
      deletedAt: input.isActive ? null : now,
    }),
  };
}

export async function updateCustomerById(
  businessId: string,
  customerId: string,
  input: UpdateCustomerInput
) {
  const updates = buildCustomerUpdates(input, new Date());

  try {
    const customer = await updateCustomer(customerId, businessId, updates);
    if (!customer) throw notFound();

    return { customer: serializeCustomer(customer) } satisfies CustomerResponse;
  } catch (err: unknown) {
    if (isErrorWithCode(err, '23505')) {
      const constraintName = extractConstraintName(err);
      if (!constraintName || constraintName === 'customers_business_id_tax_id_unique') {
        await throwDuplicateTaxIdConflict(businessId, input.taxId ?? null);
      }
      throw conflict({});
    }
    throw err;
  }
}

export async function listCustomers(
  businessId: string,
  query?: string,
  activeOnly = true,
  limit = 50
) {
  const rows = await searchCustomers(businessId, query, activeOnly, limit);

  return {
    customers: rows.map((r) => ({
      id: r.id,
      name: r.name,
      taxId: r.taxId ?? null,
      taxIdType: r.taxIdType,
      isLicensedDealer: r.isLicensedDealer,
      city: r.city ?? null,
      email: r.email ?? null,
      streetAddress: r.streetAddress ?? null,
      isActive: r.isActive,
    })),
  } satisfies CustomerListResponse;
}
