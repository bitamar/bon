import { describe, it, expect, vi } from 'vitest';
import { handleDuplicateTaxIdError } from '../../lib/duplicateTaxIdError';
import { HttpError } from '../../lib/http';
import type { CustomerFormHandle } from '../../components/CustomerForm';
import type { RefObject } from 'react';

function makeRef(setFieldError = vi.fn()): RefObject<CustomerFormHandle | null> {
  return { current: { setFieldError } } as unknown as RefObject<CustomerFormHandle | null>;
}

describe('handleDuplicateTaxIdError', () => {
  it('returns false for non-HttpError', () => {
    expect(handleDuplicateTaxIdError(new Error('generic'), makeRef(), 'biz-1')).toBe(false);
  });

  it('returns false for non-409 HttpError', () => {
    const error = new HttpError(500, 'server_error');
    expect(handleDuplicateTaxIdError(error, makeRef(), 'biz-1')).toBe(false);
  });

  it('returns false for 409 HttpError with wrong error code', () => {
    const error = new HttpError(409, 'some_other_error', { error: 'some_other_error' });
    expect(handleDuplicateTaxIdError(error, makeRef(), 'biz-1')).toBe(false);
  });

  it('sets generic error message and returns true when no customer details are provided', () => {
    const setFieldError = vi.fn();
    const error = new HttpError(409, 'duplicate_tax_id', { error: 'duplicate_tax_id' });
    const result = handleDuplicateTaxIdError(error, makeRef(setFieldError), 'biz-1');

    expect(result).toBe(true);
    expect(setFieldError).toHaveBeenCalledWith('taxId', 'מספר מזהה זה כבר קשור ללקוח קיים');
  });
});
