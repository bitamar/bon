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

export function showSuccessNotification(message: string, title = 'Success') {
  notifications.show({
    title,
    message,
    color: 'teal',
  });
}

export function showErrorNotification(message: string, title = 'Something went wrong') {
  notifications.show({
    title,
    message,
    color: 'red',
  });
}
