import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query';
import {
  extractErrorMessage,
  showErrorNotification,
  showSuccessNotification,
} from './notifications';

interface SuccessToastConfig {
  message: string;
  title?: string;
}

interface ErrorToastConfig {
  fallbackMessage?: string;
  title?: string;
}

const DEFAULT_ERROR_MESSAGE = 'Action failed';

export type ApiMutationOptions<
  TData,
  TError = unknown,
  TVariables = void,
  TContext = unknown,
> = UseMutationOptions<TData, TError, TVariables, TContext> & {
  successToast?: SuccessToastConfig | false;
  errorToast?: ErrorToastConfig | false;
};

export function useApiMutation<TData, TError = unknown, TVariables = void, TContext = unknown>(
  options: ApiMutationOptions<TData, TError, TVariables, TContext>
): UseMutationResult<TData, TError, TVariables, TContext> {
  const { successToast, errorToast, onSuccess, onError, ...rest } = options;

  return useMutation({
    ...rest,
    onSuccess: (data, variables, context) => {
      if (successToast) {
        showSuccessNotification(successToast.message, successToast.title);
      }
      onSuccess?.(data, variables, context, undefined as never);
    },
    onError: (error, variables, context) => {
      if (errorToast !== false) {
        const fallbackMessage = errorToast?.fallbackMessage ?? DEFAULT_ERROR_MESSAGE;
        showErrorNotification(extractErrorMessage(error, fallbackMessage), errorToast?.title);
      }
      onError?.(error, variables, context, undefined as never);
    },
  });
}
