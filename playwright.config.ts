import { defineConfig } from '@playwright/test'

export default defineConfig({
  globalSetup: './tests/global-setup.ts',
  testDir: './tests',
  testIgnore: process.env.GENERATE_SCREENSHOTS ? [] : ['**/screenshots.spec.ts'],
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false, // Electron tests should run serially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for Electron
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
})
