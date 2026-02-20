import {
  insertCustomer,
  findCustomerById,
  updateCustomer,
  searchCustomers,
  type CustomerRecord,
} from '../repositories/customer-repository.js';
import { conflict, isErrorWithCode, notFound } from '../lib/app-error.js';
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
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export type CreateCustomerInput = {
  name: string;
  taxId?: string;
  taxIdType?: 'company_id' | 'vat_number' | 'personal_id' | 'none';
  isLicensedDealer?: boolean;
  email?: string;
  phone?: string;
  streetAddress?: string;
  city?: string;
  postalCode?: string;
  contactName?: string;
  notes?: string;
};

export type UpdateCustomerInput = {
  name?: string | null;
  taxId?: string | null;
  taxIdType?: 'company_id' | 'vat_number' | 'personal_id' | 'none' | null;
  isLicensedDealer?: boolean;
  email?: string | null;
  phone?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  postalCode?: string | null;
  contactName?: string | null;
  notes?: string | null;
  isActive?: boolean;
};

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
      throw conflict({ code: 'duplicate_tax_id' });
    }
    throw err;
  }
}

export async function getCustomerById(businessId: string, customerId: string) {
  const customer = await findCustomerById(customerId, businessId);
  if (!customer) throw notFound();

  return { customer: serializeCustomer(customer) } satisfies CustomerResponse;
}

export async function updateCustomerById(
  businessId: string,
  customerId: string,
  input: UpdateCustomerInput
) {
  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (input.name != null) updates['name'] = input.name;
  if (input.taxId !== undefined) updates['taxId'] = input.taxId;
  if (input.taxIdType !== undefined) updates['taxIdType'] = input.taxIdType ?? 'none';
  if (input.isLicensedDealer != null) updates['isLicensedDealer'] = input.isLicensedDealer;
  if (input.email !== undefined) updates['email'] = input.email;
  if (input.phone !== undefined) updates['phone'] = input.phone;
  if (input.streetAddress !== undefined) updates['streetAddress'] = input.streetAddress;
  if (input.city !== undefined) updates['city'] = input.city;
  if (input.postalCode !== undefined) updates['postalCode'] = input.postalCode;
  if (input.contactName !== undefined) updates['contactName'] = input.contactName;
  if (input.notes !== undefined) updates['notes'] = input.notes;
  if (input.isActive != null) updates['isActive'] = input.isActive;

  try {
    const customer = await updateCustomer(
      customerId,
      businessId,
      updates as Parameters<typeof updateCustomer>[2]
    );
    if (!customer) throw notFound();

    return { customer: serializeCustomer(customer) } satisfies CustomerResponse;
  } catch (err: unknown) {
    if (isErrorWithCode(err, '23505')) {
      throw conflict({ code: 'duplicate_tax_id' });
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
      isActive: r.isActive,
    })),
  } satisfies CustomerListResponse;
}
