import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    testTimeout: 30_000,
  },
});
