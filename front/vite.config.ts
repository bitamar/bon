import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    testTimeout: 10000,
    coverage: {
      reporter: ['text', 'lcov', 'json-summary'],
      thresholds: {
        lines: 96,
        statements: 95,
        functions: 95,
        branches: 85,
      },
    },
  },
});
