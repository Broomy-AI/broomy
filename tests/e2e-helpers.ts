/**
 * Shared helpers for E2E tests.
 */
import type { Page } from '@playwright/test'

/**
 * Wait for the app to be fully rendered and interactive.
 *
 * Waits for React mount, the sidebar panel (with session cards), and the
 * toolbar to all be present. This is more reliable than waiting for a
 * generic `.cursor-pointer` which can match before the full UI renders.
 */
export async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root > div', { timeout: 15000 })
  // Sidebar panel with session search — only renders when stores are loaded
  await page.waitForSelector('[data-panel-id="sidebar"]', { timeout: 15000 })
  // Toolbar button — only renders when layout is fully mounted
  await page.waitForSelector('button[title*="Explorer"]', { timeout: 15000 })
}
