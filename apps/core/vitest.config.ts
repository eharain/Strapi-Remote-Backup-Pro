import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Integration tests need the tools/sandbox Strapi instances running.
    exclude: ['test/integration/**'],
    coverage: { provider: 'v8', reportsDirectory: '../../artifacts/coverage/core' },
  },
});
