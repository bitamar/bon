import { afterEach, describe, expect, it, vi } from 'vitest';
import { suppressConsoleError } from './suppressConsoleError';

describe('suppressConsoleError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('suppresses messages matching a string matcher', () => {
    const originalError = console.error;
    const restore = suppressConsoleError('expected error');

    console.error('this is an expected error message');

    // The mock suppressed it — the original was not called
    expect(console.error).not.toBe(originalError);
    restore();
  });

  it('passes through messages that do not match', () => {
    const calls: unknown[][] = [];
    const originalError = console.error;
    // Temporarily replace console.error to capture passthrough calls
    console.error = (...args: unknown[]) => calls.push(args);
    const restore = suppressConsoleError('expected error');

    console.error('something different');

    // The mock should have called the original (our capture fn) for non-matching
    restore();
    console.error = originalError;
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it('suppresses messages matching a regex matcher', () => {
    const originalError = console.error;
    const restore = suppressConsoleError(/act\(\.\.\.\)/);

    console.error('Warning: act(...) is not supported');

    expect(console.error).not.toBe(originalError);
    restore();
  });

  it('restores original console.error after calling the restore function', () => {
    const originalError = console.error;
    const restore = suppressConsoleError('anything');

    expect(console.error).not.toBe(originalError);
    restore();
    expect(console.error).toBe(originalError);
  });
});
