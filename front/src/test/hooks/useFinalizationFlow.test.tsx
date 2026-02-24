import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFinalizationFlow } from '../../hooks/useFinalizationFlow';
import type { Business } from '@bon/types/businesses';
import type { ReactNode } from 'react';

vi.mock('../../api/invoices', () => ({
  finalizeInvoice: vi.fn(),
}));
vi.mock('../../lib/notifications', () => ({
  showErrorNotification: vi.fn(),
  showSuccessNotification: vi.fn(),
  extractErrorMessage: vi.fn((_error: unknown, fallback: string) => fallback),
}));

import * as invoicesApi from '../../api/invoices';
import * as notifications from '../../lib/notifications';

// ── helpers ──

function makeCompleteBusiness(): Business {
  return {
    id: 'biz-1',
    name: 'Test Co',
    businessType: 'licensed_dealer',
    registrationNumber: '123456782',
    vatNumber: '123456782',
    streetAddress: '123 Main St',
    city: 'Tel Aviv',
    postalCode: '1234567',
    phone: null,
    email: null,
    invoiceNumberPrefix: null,
    startingInvoiceNumber: 1,
    defaultVatRate: 1700,
    logoUrl: null,
    isActive: true,
    createdByUserId: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const defaultItems = [
  {
    key: 'item-1',
    description: 'שירות ייעוץ',
    catalogNumber: '',
    quantity: 1,
    unitPrice: 100,
    discountPercent: 0,
    vatRateBasisPoints: 1700,
  },
];

const defaultParams = {
  businessId: 'biz-1',
  invoiceId: 'inv-1',
  business: makeCompleteBusiness(),
  businessType: 'licensed_dealer' as const,
  customerId: 'cust-1',
  items: defaultItems,
  invoiceDate: new Date('2026-02-20'),
  totalVatMinorUnits: 1700,
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe('useFinalizationFlow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() => useFinalizationFlow(defaultParams), {
      wrapper: makeWrapper(),
    });

    expect(result.current.step).toBe('idle');
    expect(result.current.validationErrors).toEqual([]);
  });

  it('shows validation errors when customer is missing', () => {
    const { result } = renderHook(
      () => useFinalizationFlow({ ...defaultParams, customerId: null }),
      { wrapper: makeWrapper() }
    );

    act(() => result.current.startFinalization());

    expect(result.current.validationErrors).toContain('יש לבחור לקוח לפני הפקת חשבונית');
    expect(result.current.step).toBe('idle');
  });

  it('shows validation errors when no items', () => {
    const { result } = renderHook(
      () =>
        useFinalizationFlow({
          ...defaultParams,
          items: [
            {
              key: 'empty',
              description: '',
              catalogNumber: '',
              quantity: 1,
              unitPrice: 0,
              discountPercent: 0,
              vatRateBasisPoints: 1700,
            },
          ],
        }),
      { wrapper: makeWrapper() }
    );

    act(() => result.current.startFinalization());

    expect(result.current.validationErrors).toContain('יש להוסיף לפחות שורה אחת עם תיאור');
    expect(result.current.step).toBe('idle');
  });

  it('goes to profile_gate when business profile is incomplete', () => {
    const incompleteBusiness = { ...makeCompleteBusiness(), city: null };
    const { result } = renderHook(
      () => useFinalizationFlow({ ...defaultParams, business: incompleteBusiness }),
      { wrapper: makeWrapper() }
    );

    act(() => result.current.startFinalization());

    expect(result.current.step).toBe('profile_gate');
  });

  it('goes to vat_exemption when VAT is 0 and non-exempt', () => {
    const { result } = renderHook(
      () => useFinalizationFlow({ ...defaultParams, totalVatMinorUnits: 0 }),
      { wrapper: makeWrapper() }
    );

    act(() => result.current.startFinalization());

    expect(result.current.step).toBe('vat_exemption');
  });

  it('skips vat_exemption for exempt_dealer', () => {
    const exemptBusiness = { ...makeCompleteBusiness(), businessType: 'exempt_dealer' as const };
    const { result } = renderHook(
      () =>
        useFinalizationFlow({
          ...defaultParams,
          business: exemptBusiness,
          businessType: 'exempt_dealer',
          totalVatMinorUnits: 0,
        }),
      { wrapper: makeWrapper() }
    );

    act(() => result.current.startFinalization());

    expect(result.current.step).toBe('preview');
  });

  it('goes directly to preview when profile is complete and VAT > 0', () => {
    const { result } = renderHook(() => useFinalizationFlow(defaultParams), {
      wrapper: makeWrapper(),
    });

    act(() => result.current.startFinalization());

    expect(result.current.step).toBe('preview');
  });

  it('transitions from profile_gate to preview via onProfileSaved', () => {
    const incompleteBusiness = { ...makeCompleteBusiness(), city: null };
    const { result } = renderHook(
      () => useFinalizationFlow({ ...defaultParams, business: incompleteBusiness }),
      { wrapper: makeWrapper() }
    );

    act(() => result.current.startFinalization());
    expect(result.current.step).toBe('profile_gate');

    act(() => result.current.onProfileSaved());
    // With totalVatMinorUnits > 0, should go to preview
    expect(result.current.step).toBe('preview');
  });

  it('transitions from vat_exemption to preview via onVatExemptionConfirmed', () => {
    const { result } = renderHook(
      () => useFinalizationFlow({ ...defaultParams, totalVatMinorUnits: 0 }),
      { wrapper: makeWrapper() }
    );

    act(() => result.current.startFinalization());
    expect(result.current.step).toBe('vat_exemption');

    act(() => result.current.onVatExemptionConfirmed('ייצוא שירותים §30(א)(5)'));
    expect(result.current.step).toBe('preview');
    expect(result.current.vatExemptionReason).toBe('ייצוא שירותים §30(א)(5)');
  });

  it('calls finalizeInvoice on confirmFinalize', async () => {
    vi.mocked(invoicesApi.finalizeInvoice).mockResolvedValue({
      invoice: {
        id: 'inv-1',
        businessId: 'biz-1',
        customerId: 'cust-1',
        customerName: 'Test',
        customerTaxId: null,
        customerAddress: null,
        customerEmail: null,
        documentType: 'tax_invoice',
        status: 'finalized',
        isOverdue: false,
        sequenceGroup: 'tax_document',
        sequenceNumber: 1,
        documentNumber: 'INV-0001',
        creditedInvoiceId: null,
        invoiceDate: '2026-02-20',
        issuedAt: '2026-02-20T10:00:00.000Z',
        dueDate: null,
        notes: null,
        internalNotes: null,
        currency: 'ILS',
        vatExemptionReason: null,
        subtotalMinorUnits: 10000,
        discountMinorUnits: 0,
        totalExclVatMinorUnits: 10000,
        vatMinorUnits: 1700,
        totalInclVatMinorUnits: 11700,
        allocationStatus: null,
        allocationNumber: null,
        allocationError: null,
        sentAt: null,
        paidAt: null,
        createdAt: '2026-02-20T00:00:00.000Z',
        updatedAt: '2026-02-20T10:00:00.000Z',
      },
      items: [],
    });

    const { result } = renderHook(() => useFinalizationFlow(defaultParams), {
      wrapper: makeWrapper(),
    });

    act(() => result.current.startFinalization());
    expect(result.current.step).toBe('preview');

    await act(async () => result.current.confirmFinalize());

    expect(invoicesApi.finalizeInvoice).toHaveBeenCalledWith('biz-1', 'inv-1', {
      invoiceDate: '2026-02-20',
    });
  });

  it('shows error notification on finalize failure', async () => {
    vi.mocked(invoicesApi.finalizeInvoice).mockRejectedValue(new Error('server error'));

    const { result } = renderHook(() => useFinalizationFlow(defaultParams), {
      wrapper: makeWrapper(),
    });

    act(() => result.current.startFinalization());
    await act(async () => result.current.confirmFinalize());

    expect(notifications.showErrorNotification).toHaveBeenCalledWith('server error');
    expect(result.current.step).toBe('preview');
  });

  it('resets to idle on closeModal', () => {
    const { result } = renderHook(() => useFinalizationFlow(defaultParams), {
      wrapper: makeWrapper(),
    });

    act(() => result.current.startFinalization());
    expect(result.current.step).toBe('preview');

    act(() => result.current.closeModal());
    expect(result.current.step).toBe('idle');
  });
});
