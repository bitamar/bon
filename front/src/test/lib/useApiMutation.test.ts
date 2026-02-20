import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseMutationResult } from '@tanstack/react-query';
import { useApiMutation, type ApiMutationOptions } from '../../lib/useApiMutation';

const {
  useMutationMock,
  showSuccessNotificationMock,
  showErrorNotificationMock,
  extractErrorMessageMock,
} = vi.hoisted(() => ({
  useMutationMock: vi.fn(),
  showSuccessNotificationMock: vi.fn(),
  showErrorNotificationMock: vi.fn(),
  extractErrorMessageMock: vi.fn((error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback
  ),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useMutation: useMutationMock,
  };
});

vi.mock('../../lib/notifications', () => ({
  showSuccessNotification: showSuccessNotificationMock,
  showErrorNotification: showErrorNotificationMock,
  extractErrorMessage: extractErrorMessageMock,
}));

describe('useApiMutation', () => {
  const mutationResult = {} as UseMutationResult<unknown, unknown, unknown, unknown>;

  beforeEach(() => {
    useMutationMock.mockReset();
    showSuccessNotificationMock.mockReset();
    showErrorNotificationMock.mockReset();
    extractErrorMessageMock.mockClear();
    useMutationMock.mockReturnValue(mutationResult);
  });

  const getMutationOptions = () => {
    const call = useMutationMock.mock.calls[0];
    if (!call) throw new Error('Expected useMutation to be called');
    const [options] = call as [ApiMutationOptions<unknown, unknown, unknown, unknown>?];
    if (!options) throw new Error('Expected useMutation options to be provided');
    return options;
  };

  it('wraps useMutation and shows success toast', () => {
    const onSuccess = vi.fn();
    const hookResult = useApiMutation({
      mutationFn: vi.fn(),
      successToast: { message: 'Saved!', title: 'Done' },
      onSuccess,
    });

    expect(hookResult).toBe(mutationResult);

    const { onSuccess: wrappedOnSuccess } = getMutationOptions();
    if (!wrappedOnSuccess) throw new Error('Expected onSuccess handler');

    const data = { ok: true };
    const variables = { id: 1 };
    const context = {};
    wrappedOnSuccess(data, variables, context, undefined as never);

    expect(showSuccessNotificationMock).toHaveBeenCalledWith('Saved!', 'Done');
    expect(onSuccess).toHaveBeenCalledWith(data, variables, context, undefined);
  });

  it('skips success toast when disabled', () => {
    const onSuccess = vi.fn();
    useApiMutation({ mutationFn: vi.fn(), successToast: false, onSuccess });

    const { onSuccess: wrappedOnSuccess } = getMutationOptions();
    if (!wrappedOnSuccess) throw new Error('Expected onSuccess handler');

    wrappedOnSuccess(undefined, undefined, undefined, undefined as never);
    expect(showSuccessNotificationMock).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
  });

  it('shows error toast with extracted message', () => {
    const onError = vi.fn();
    useApiMutation({
      mutationFn: vi.fn(),
      errorToast: { fallbackMessage: 'Fallback', title: 'Error' },
      onError,
    });

    const { onError: wrappedOnError } = getMutationOptions();
    if (!wrappedOnError) throw new Error('Expected onError handler');

    const error = new Error('Boom');
    const variables = { id: 1 };
    const context = {};

    wrappedOnError(error, variables, context, undefined as never);

    expect(extractErrorMessageMock).toHaveBeenCalledWith(error, 'Fallback');
    expect(showErrorNotificationMock).toHaveBeenCalledWith('Boom', 'Error');
    expect(onError).toHaveBeenCalledWith(error, variables, context, undefined);
  });

  it('uses default fallback when error toast not provided', () => {
    useApiMutation({ mutationFn: vi.fn() });

    const { onError: wrappedOnError } = getMutationOptions();
    if (!wrappedOnError) throw new Error('Expected onError handler');

    const error = {};
    extractErrorMessageMock.mockReturnValueOnce('Default message');
    wrappedOnError(error, undefined, undefined, undefined as never);

    expect(extractErrorMessageMock).toHaveBeenCalledWith(error, 'הפעולה נכשלה');
    expect(showErrorNotificationMock).toHaveBeenCalledWith('Default message', undefined);
  });
});
