import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      enabled: false,
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/server.ts', 'src/env.ts'],
      thresholds: {
        lines: 95,
        statements: 95,
        functions: 85,
        branches: 90,
      },
    },
  },
});
