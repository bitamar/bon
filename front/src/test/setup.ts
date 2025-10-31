import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

if (!import.meta.env.VITE_API_BASE_URL) {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost');
}

if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
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

if (!('ResizeObserver' in window)) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // @ts-expect-error - we're defining it for the test environment
  window.ResizeObserver = ResizeObserver;
}
