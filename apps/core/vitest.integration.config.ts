import { defineConfig } from 'vitest/config';

/**
 * The integration suite needs its own config because the default one excludes
 * it: these tests talk to live Strapi instances, so they must never run as a
 * side effect of `npm test` on a laptop with nothing listening.
 */
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    // A round trip does real HTTP against two instances and uploads a media
    // library. The default five seconds is not a meaningful budget for that.
    testTimeout: 600_000,
    hookTimeout: 600_000,
    fileParallelism: false,
  },
});
