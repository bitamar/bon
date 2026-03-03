import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Suppress React act() warnings. All warnings in this suite originate from Mantine 8
// internal components (ScrollAreaRoot, Popover, Transition, …) whose async state updates
// fire outside the test-controlled rendering cycle and are not actionable from test code.
// Root-cause: fake-timer tests advance time past Mantine's internal animation/scroll timers,
// which update state during teardown. Targeted suppression by component name is fragile
// (display names change across Mantine versions) and provides no additional safety because
// even warnings attributed to our own components (InvoiceEdit, CustomerSelect) are React
// walking up the fiber tree from a Mantine leaf — not our own state updates.
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
