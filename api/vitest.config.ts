import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    maxWorkers: 1,
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
      ],
    },
  },
});
