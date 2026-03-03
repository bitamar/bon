import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Suppress React act() warnings from Mantine internal components.
// Mantine 8 components (ScrollAreaRoot, Popover, Transition, Portal, SegmentedControl, etc.)
// trigger async state updates during their lifecycle that happen outside the test-controlled
// rendering cycle. These warnings are noise — not actionable from test code.
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('was not wrapped in act(')) {
    return;
  }
  originalConsoleError.apply(console, args);
};

if (!import.meta.env.VITE_API_BASE_URL) {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost');
}

if (!globalThis.matchMedia) {
  globalThis.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

if (!('ResizeObserver' in globalThis)) {
  class ResizeObserver {
    observe() {
      /* noop */
    }
    unobserve() {
      /* noop */
    }
    disconnect() {
      /* noop */
    }
  }
  globalThis.ResizeObserver = ResizeObserver;
}
