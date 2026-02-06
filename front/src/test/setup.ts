import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

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
