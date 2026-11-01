import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    // Component tests render the whole panel and wait on streamed events; the default 5s was occasionally
    // too tight on a busy machine. A real bug fails on its assertion, not on time.
    testTimeout: 15_000,
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next'],
    coverage: {
      include: ['app/**', 'components/**', 'lib/**', 'store/**'],
    },
  },
});
