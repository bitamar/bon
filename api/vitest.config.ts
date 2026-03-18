import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    maxWorkers: 1,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      enabled: false,
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/auth/types.ts',
        'src/db/**',
        'src/env.ts',
        'drizzle.config.ts',
        'src/server.ts',
        'src/services/meshulam/types.ts',
        'src/services/shaam/types.ts',
      ],
      thresholds: {
        lines: 95,
        statements: 94,
        functions: 95,
        branches: 80,
      },
    },
  },
});
