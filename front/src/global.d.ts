declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

// Vitest 4 moved Assertion to @vitest/expect; re-augment so
// @testing-library/jest-dom matchers are visible on expect().
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module '@vitest/expect' {
  interface Assertion<T> extends TestingLibraryMatchers<typeof expect.stringContaining, T> {}
}
