import type { ReactNode, RefObject } from 'react';
import { Anchor } from '@mantine/core';
import { Link } from 'react-router-dom';
import { HttpError } from './http';
import type { CustomerFormHandle } from '../components/CustomerForm';

/**
 * If the error is a 409 duplicate_tax_id, set an inline field error and return true.
 * Otherwise return false so the caller can fall through to a generic notification.
 */
export function handleDuplicateTaxIdError(
  error: unknown,
  formRef: RefObject<CustomerFormHandle | null>
): boolean {
  if (!(error instanceof HttpError) || error.status !== 409) return false;

  const body = error.body as
    | {
        error?: string;
        details?: { existingCustomerId?: string; existingCustomerName?: string };
      }
    | undefined;

  if (body?.error !== 'duplicate_tax_id') return false;

  let message: ReactNode = 'מספר מזהה זה כבר קשור ללקוח קיים';
  if (body.details?.existingCustomerId && body.details?.existingCustomerName) {
    message = (
      <>
        {`מספר מזהה זה כבר קיים עבור ${body.details.existingCustomerName} `}
        <Anchor
          component={Link}
          to={`/business/customers/${body.details.existingCustomerId}`}
          size="sm"
        >
          עבור ללקוח הקיים
        </Anchor>
      </>
    );
  }

  formRef.current?.setFieldError('taxId', message);
  return true;
}
