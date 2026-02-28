import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { finalizeInvoice } from '../api/invoices';
import { queryKeys } from '../lib/queryKeys';
import { showErrorNotification } from '../lib/notifications';
import { hasIncompleteProfile } from '../components/BusinessProfileGateModal';
import { HttpError } from '../lib/http';
import type { Business, BusinessType } from '@bon/types/businesses';
import type { FinalizeInvoiceBody } from '@bon/types/invoices';
import type { LineItemFormRow } from '../components/InvoiceLineItems';

export type FinalizationStep = 'idle' | 'profile_gate' | 'vat_exemption' | 'preview' | 'finalizing';

function buildFinalizeBody(
  invoiceDate: Date | null,
  vatExemptionReason: string | null
): FinalizeInvoiceBody {
  const body: FinalizeInvoiceBody = {};
  if (invoiceDate) {
    const y = invoiceDate.getFullYear();
    const m = String(invoiceDate.getMonth() + 1).padStart(2, '0');
    const d = String(invoiceDate.getDate()).padStart(2, '0');
    body.invoiceDate = `${y}-${m}-${d}`;
  }
  if (vatExemptionReason) {
    body.vatExemptionReason = vatExemptionReason;
  }
  return body;
}

interface ClientValidationResult {
  valid: boolean;
  errors: string[];
}

interface UseFinalizationFlowParams {
  businessId: string;
  invoiceId: string;
  business: Readonly<Business> | null;
  businessType: BusinessType | undefined;
  customerId: string | null;
  items: ReadonlyArray<Readonly<LineItemFormRow>>;
  invoiceDate: Date | null;
  totalVatMinorUnits: number;
}

export function useFinalizationFlow({
  businessId,
  invoiceId,
  business,
  businessType,
  customerId,
  items,
  invoiceDate,
  totalVatMinorUnits,
}: UseFinalizationFlowParams) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<FinalizationStep>('idle');
  const [vatExemptionReason, setVatExemptionReason] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const isConfirmingRef = useRef(false);

  const validateClient = useCallback((): ClientValidationResult => {
    const errors: string[] = [];

    if (!customerId) {
      errors.push('יש לבחור לקוח לפני הפקת חשבונית');
    }

    const hasDescribedItem = items.some((item) => item.description.trim() !== '');
    if (!hasDescribedItem) {
      errors.push('יש להוסיף לפחות שורה אחת עם תיאור');
    }

    if (items.some((item) => item.unitPrice !== 0 && item.description.trim() === '')) {
      errors.push('יש שורות ללא תיאור — נא להוסיף תיאור לכל שורה עם מחיר');
    }

    if (invoiceDate) {
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      if (invoiceDate > sevenDaysFromNow) {
        errors.push('תאריך החשבונית לא יכול להיות יותר מ-7 ימים בעתיד');
      }
    }

    return { valid: errors.length === 0, errors };
  }, [customerId, items, invoiceDate]);

  const needsVatExemption =
    totalVatMinorUnits === 0 && businessType != null && businessType !== 'exempt_dealer';

  const startFinalization = useCallback(() => {
    setVatExemptionReason(null);
    setConfirming(false);

    const result = validateClient();
    if (!result.valid) {
      setValidationErrors(result.errors);
      return;
    }
    setValidationErrors([]);

    if (business && businessType && hasIncompleteProfile(business, businessType)) {
      setStep('profile_gate');
      return;
    }

    if (needsVatExemption) {
      setStep('vat_exemption');
      return;
    }

    setStep('preview');
  }, [validateClient, business, businessType, needsVatExemption]);

  const onProfileSaved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.business(businessId) });

    if (needsVatExemption) {
      setStep('vat_exemption');
    } else {
      setStep('preview');
    }
  }, [queryClient, businessId, needsVatExemption]);

  const onVatExemptionConfirmed = useCallback((reason: string) => {
    setVatExemptionReason(reason);
    setStep('preview');
  }, []);

  const confirmFinalize = useCallback(async () => {
    if (isConfirmingRef.current) return;
    isConfirmingRef.current = true;
    setConfirming(true);
    setStep('finalizing');

    try {
      await finalizeInvoice(
        businessId,
        invoiceId,
        buildFinalizeBody(invoiceDate, vatExemptionReason)
      );

      queryClient.invalidateQueries({ queryKey: queryKeys.invoice(businessId, invoiceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices(businessId) });

      navigate(`/businesses/${businessId}/invoices/${invoiceId}`);
    } catch (err) {
      setStep('preview');

      if (err instanceof HttpError) {
        const body = err.body as { code?: string } | undefined;
        const code = body?.code;

        if (code === 'customer_inactive') {
          showErrorNotification('הלקוח שנבחר אינו פעיל. חזור לטיוטה ובחר לקוח אחר');
          setStep('idle');
          return;
        }

        if (code === 'missing_vat_exemption_reason') {
          setStep('vat_exemption');
          return;
        }

        if (code === 'sequence_conflict') {
          showErrorNotification('שגיאה בהקצאת מספר — נסו שוב');
          return;
        }
      }

      showErrorNotification(err instanceof Error ? err.message : 'שגיאה בהפקת החשבונית — נסו שוב');
    } finally {
      isConfirmingRef.current = false;
      setConfirming(false);
    }
  }, [businessId, invoiceId, invoiceDate, vatExemptionReason, navigate, queryClient]);

  const closeModal = useCallback(() => {
    setStep('idle');
    setVatExemptionReason(null);
    setConfirming(false);
  }, []);

  return {
    step,
    validationErrors,
    vatExemptionReason,
    confirming,
    startFinalization,
    onProfileSaved,
    onVatExemptionConfirmed,
    confirmFinalize,
    closeModal,
  };
}
