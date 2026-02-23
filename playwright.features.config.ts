import { defineConfig } from '@playwright/test'

/**
 * Playwright config for feature documentation tests.
 * These are separate from regular E2E tests and run on demand via:
 *   pnpm test:feature-docs
 */
export default defineConfig({
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
  testDir: './tests/features',
  testIgnore: ['**/_shared/**'],
  timeout: 60000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    trace: 'off',
    screenshot: 'off',
  },
})
