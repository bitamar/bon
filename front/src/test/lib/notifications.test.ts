import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractErrorMessage,
  showErrorNotification,
  showSuccessNotification,
} from '../../lib/notifications';

const { showMock } = vi.hoisted(() => ({
  showMock: vi.fn(),
}));

vi.mock('@mantine/notifications', () => ({
  notifications: {
    show: showMock,
  },
}));

describe('notifications helpers', () => {
  beforeEach(() => {
    showMock.mockReset();
  });

  it('extractErrorMessage prefers Error message', () => {
    expect(extractErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('extractErrorMessage returns string error', () => {
    expect(extractErrorMessage('plain error', 'fallback')).toBe('plain error');
  });

  it('extractErrorMessage falls back when needed', () => {
    expect(extractErrorMessage({ unexpected: true }, 'fallback')).toBe('fallback');
  });

  it('showSuccessNotification forwards title and message', () => {
    showSuccessNotification('Saved!', 'Great Success');
    expect(showMock).toHaveBeenCalledWith({
      title: 'Great Success',
      message: 'Saved!',
      color: 'teal',
    });
  });

  it('showErrorNotification forwards title and message', () => {
    showErrorNotification('Failed...');
    expect(showMock).toHaveBeenCalledWith({
      title: 'משהו השתבש',
      message: 'Failed...',
      color: 'red',
    });
  });
});
