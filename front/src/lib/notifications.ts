import { notifications } from '@mantine/notifications';

export function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return fallback;
}

export function showSuccessNotification(message: string, title = 'הצלחה') {
  notifications.show({
    title,
    message,
    color: 'brand',
  });
}

export function showErrorNotification(message: string, title = 'משהו השתבש') {
  notifications.show({
    title,
    message,
    color: 'red',
  });
}
