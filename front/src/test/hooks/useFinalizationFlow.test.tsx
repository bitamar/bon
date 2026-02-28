import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFinalizationFlow } from '../../hooks/useFinalizationFlow';
import { HttpError } from '../../lib/http';
import { makeTestBusiness } from '../utils/businessStubs';
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
import { makeFinalizedInvoice } from '../utils/invoiceStubs';

// ── helpers ──

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
  business: makeTestBusiness(),
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
    const incompleteBusiness = { ...makeTestBusiness(), city: null };
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
    const exemptBusiness = { ...makeTestBusiness(), businessType: 'exempt_dealer' as const };
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
    const incompleteBusiness = { ...makeTestBusiness(), city: null };
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
    vi.mocked(invoicesApi.finalizeInvoice).mockResolvedValue(makeFinalizedInvoice());

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

  it('shows validation error when invoiceDate is more than 7 days in future', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);

    const { result } = renderHook(
      () => useFinalizationFlow({ ...defaultParams, invoiceDate: futureDate }),
      { wrapper: makeWrapper() }
    );

    act(() => result.current.startFinalization());

    expect(result.current.validationErrors).toContain(
      'תאריך החשבונית לא יכול להיות יותר מ-7 ימים בעתיד'
    );
    expect(result.current.step).toBe('idle');
  });

  it('onProfileSaved goes to vat_exemption when needsVatExemption is true', () => {
    const incompleteBusiness = { ...makeTestBusiness(), city: null };

    const { result } = renderHook(
      () =>
        useFinalizationFlow({
          ...defaultParams,
          business: incompleteBusiness,
          totalVatMinorUnits: 0,
        }),
      { wrapper: makeWrapper() }
    );

    act(() => result.current.startFinalization());
    expect(result.current.step).toBe('profile_gate');

    act(() => result.current.onProfileSaved());
    expect(result.current.step).toBe('vat_exemption');
  });

  it('confirmFinalize handles customer_inactive error by going to idle', async () => {
    const error = new HttpError(422, 'inactive', { code: 'customer_inactive' });
    vi.mocked(invoicesApi.finalizeInvoice).mockRejectedValue(error);

    const { result } = renderHook(() => useFinalizationFlow(defaultParams), {
      wrapper: makeWrapper(),
    });

    act(() => result.current.startFinalization());
    await act(async () => result.current.confirmFinalize());

    expect(result.current.step).toBe('idle');
    expect(notifications.showErrorNotification).toHaveBeenCalledWith(
      'הלקוח שנבחר אינו פעיל. חזור לטיוטה ובחר לקוח אחר'
    );
  });

  it('confirmFinalize handles missing_vat_exemption_reason by going to vat_exemption', async () => {
    const error = new HttpError(422, 'missing', { code: 'missing_vat_exemption_reason' });
    vi.mocked(invoicesApi.finalizeInvoice).mockRejectedValue(error);

    const { result } = renderHook(() => useFinalizationFlow(defaultParams), {
      wrapper: makeWrapper(),
    });

    act(() => result.current.startFinalization());
    await act(async () => result.current.confirmFinalize());

    expect(result.current.step).toBe('vat_exemption');
  });

  it('confirmFinalize handles sequence_conflict with error notification', async () => {
    const error = new HttpError(409, 'conflict', { code: 'sequence_conflict' });
    vi.mocked(invoicesApi.finalizeInvoice).mockRejectedValue(error);

    const { result } = renderHook(() => useFinalizationFlow(defaultParams), {
      wrapper: makeWrapper(),
    });

    act(() => result.current.startFinalization());
    await act(async () => result.current.confirmFinalize());

    expect(notifications.showErrorNotification).toHaveBeenCalledWith('שגיאה בהקצאת מספר — נסו שוב');
    expect(result.current.step).toBe('preview');
  });

  it('resets to idle and clears transient state on closeModal', () => {
    const { result } = renderHook(
      () => useFinalizationFlow({ ...defaultParams, totalVatMinorUnits: 0 }),
      { wrapper: makeWrapper() }
    );

    act(() => result.current.startFinalization());
    expect(result.current.step).toBe('vat_exemption');

    act(() => result.current.onVatExemptionConfirmed('ייצוא שירותים §30(א)(5)'));
    expect(result.current.vatExemptionReason).toBe('ייצוא שירותים §30(א)(5)');

    act(() => result.current.closeModal());
    expect(result.current.step).toBe('idle');
    expect(result.current.vatExemptionReason).toBeNull();
    expect(result.current.confirming).toBe(false);
  });
});
