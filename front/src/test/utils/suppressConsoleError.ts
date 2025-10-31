import { vi } from 'vitest';

type Matcher = string | RegExp;

export function suppressConsoleError(matcher: Matcher) {
  const originalError = console.error;
  const matches = (message: string) =>
    typeof matcher === 'string' ? message.includes(matcher) : matcher.test(message);

  const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const message = args.map((arg) => String(arg)).join(' ');
    if (matches(message)) {
      return;
    }
    originalError.apply(console, args as [unknown, ...unknown[]]);
  });

  return () => {
    spy.mockRestore();
  };
}
