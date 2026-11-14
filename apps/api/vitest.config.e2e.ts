import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    env: { LOG_LEVEL: 'silent', NODE_ENV: 'test' },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Files share one database; run them one after another.
    fileParallelism: false,
  },
});
