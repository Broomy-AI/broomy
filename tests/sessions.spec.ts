import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { dockerArgs } from './electron-launch-args'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [...dockerArgs, path.join(__dirname, '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      E2E_TEST: 'true',
      E2E_HEADLESS: process.env.E2E_HEADLESS ?? 'true',
    },
  })
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root > div', { timeout: 10000 })
  // Wait for sessions to load
  await page.waitForSelector('.cursor-pointer', { timeout: 10000 })
})

test.afterAll(async () => {
  if (electronApp) await electronApp.close()
})

// Helper to open the New Session dialog fresh
async function openNewSessionDialog() {
  const newSessionBtn = page.locator('button:has-text("+ New Session")')
  await newSessionBtn.click()
  await expect(page.locator('h2:has-text("New Session")')).toBeVisible()
}

// Helper to close the dialog
async function closeDialog() {
  await page.keyboard.press('Escape')
  // Wait for dialog to close - if we're in a sub-view, first press goes back to home
  const heading = page.locator('h2:has-text("New Session")')
  if (await heading.isVisible()) {
    await page.keyboard.press('Escape')
  }
  await expect(heading).not.toBeVisible()
}

// ── New Session Dialog ─────────────────────────────────────────────────────

test.describe('New Session Dialog', () => {
  test('should open dialog with action buttons and repos', async () => {
    await openNewSessionDialog()

    // Should show action buttons (Clone, Add Repo, Folder)
    await expect(page.locator('button:has-text("Clone")')).toBeVisible()
    await expect(page.locator('button:has-text("Add Repo")')).toBeVisible()
    await expect(page.locator('button:has-text("Folder")')).toBeVisible()

    // The "demo-project" repo should be visible from mock data
    await expect(page.locator('text=demo-project')).toBeVisible()

    // Each repo row should have action buttons using title attributes for reliable selection
    await expect(page.locator('button[title="Create a new branch worktree"]')).toBeVisible()
    await expect(page.locator('button[title="Open an existing branch"]')).toBeVisible()
    await expect(page.locator('button[title="Browse GitHub issues"]')).toBeVisible()
    await expect(page.locator('button[title="Review pull requests"]')).toBeVisible()
    await expect(page.locator('button[title="Open main branch"]')).toBeVisible()

    await closeDialog()
  })

  test('should navigate to New Branch view and back', async () => {
    await openNewSessionDialog()

    await page.locator('button[title="Create a new branch worktree"]').click()

    // Should show "New Branch" heading
    await expect(page.locator('h2:has-text("New Branch")')).toBeVisible()

    // Should show branch name input
    await expect(page.locator('input[placeholder*="feature/"]')).toBeVisible()

    // Go back to home
    await page.keyboard.press('Escape')
    await expect(page.locator('h2:has-text("New Session")')).toBeVisible()

    await closeDialog()
  })

  test('should navigate to Existing Branch view and back', async () => {
    await openNewSessionDialog()

    await page.locator('button[title="Open an existing branch"]').click()

    // Should navigate to a sub-view (heading changes)
    await expect(page.locator('h2:has-text("New Session")')).not.toBeVisible()

    // Go back
    await page.keyboard.press('Escape')
    await expect(page.locator('h2:has-text("New Session")')).toBeVisible()

    await closeDialog()
  })

  test('should navigate to Issues view with mock issues', async () => {
    await openNewSessionDialog()

    await page.locator('button[title="Browse GitHub issues"]').click()

    // Should show "Issues" heading
    await expect(page.locator('h2:has-text("Issues")')).toBeVisible()

    // Should display mock issues from E2E data
    await expect(page.locator('text=Add support for the dark mode toggle').first()).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Fix the crash that happens').first()).toBeVisible()

    // Go back
    await page.keyboard.press('Escape')
    await expect(page.locator('h2:has-text("New Session")')).toBeVisible()

    await closeDialog()
  })

  test('should navigate to Review PRs view with mock PRs', async () => {
    await openNewSessionDialog()

    await page.locator('button[title="Review pull requests"]').click()

    // Should show review-related heading
    await expect(page.locator('h2:has-text("Review")').first()).toBeVisible()

    // Should display mock PRs from E2E data
    await expect(page.locator('text=Add dark mode support').first()).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Fix memory leak in worker pool').first()).toBeVisible()

    // Go back
    await page.keyboard.press('Escape')
    await expect(page.locator('h2:has-text("New Session")')).toBeVisible()

    await closeDialog()
  })
})

// ── Session Search ─────────────────────────────────────────────────────────

test.describe('Session Search', () => {
  test('should filter sessions by search text', async () => {
    const searchInput = page.locator('[data-session-search]')
    await searchInput.fill('backend')

    // backend-api should be visible
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await expect(backendSession).toBeVisible()

    // broomy should not be visible
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await expect(broomySession).not.toBeVisible()

    // Clear search
    await searchInput.fill('')

    // All sessions should be visible again
    await expect(broomySession).toBeVisible()
    await expect(backendSession).toBeVisible()
  })

  test('should show "No matching sessions" for bad search', async () => {
    const searchInput = page.locator('[data-session-search]')
    await searchInput.fill('nonexistent-repo-xyz')

    await expect(page.locator('text=No matching sessions')).toBeVisible()

    // Clear search
    await searchInput.fill('')
  })
})

// ── Session Archive ────────────────────────────────────────────────────────

test.describe('Session Archive', () => {
  test('should show archive button on session hover', async () => {
    const docsSession = page.locator('.cursor-pointer:has-text("docs-site")')
    await docsSession.hover()

    const archiveBtn = docsSession.locator('button[title="Archive session"]')
    await expect(archiveBtn).toBeVisible()
  })

  test('should archive and unarchive a session', async () => {
    const docsSession = page.locator('.cursor-pointer:has-text("docs-site")')
    await docsSession.hover()

    // Archive it
    const archiveBtn = docsSession.locator('button[title="Archive session"]')
    await archiveBtn.click()

    // Session should no longer be in the main list
    await expect(page.locator('.cursor-pointer:has-text("docs-site")')).not.toBeVisible()

    // "Archived" section should appear
    const archivedHeader = page.locator('button:has-text("Archived")')
    await expect(archivedHeader).toBeVisible()

    // Expand archived section
    await archivedHeader.click()

    // Wait for archived session to appear
    const archivedSession = page.locator('.cursor-pointer:has-text("docs-site")')
    await expect(archivedSession).toBeVisible()

    // Unarchive it
    await archivedSession.hover()
    const unarchiveBtn = archivedSession.locator('button[title="Unarchive session"]')
    await unarchiveBtn.click()

    // Session should be back in the main list
    await expect(page.locator('.cursor-pointer:has-text("docs-site")')).toBeVisible()
  })
})

// ── Session Delete ─────────────────────────────────────────────────────────

test.describe('Session Delete', () => {
  test('should show delete confirmation and cancel', async () => {
    const docsSession = page.locator('.cursor-pointer:has-text("docs-site")')
    await docsSession.hover()

    // Delete button should be visible
    const deleteBtn = docsSession.locator('button[title="Delete session"]')
    await expect(deleteBtn).toBeVisible()

    // Click delete
    await deleteBtn.click()

    // Confirmation modal should appear with delete and cancel buttons
    await expect(page.locator('button:has-text("Delete")').last()).toBeVisible()
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible()

    // Cancel the delete
    await page.locator('button:has-text("Cancel")').click()

    // Session should still exist
    await expect(page.locator('.cursor-pointer:has-text("docs-site")')).toBeVisible()
  })
})

// ── Session Keyboard Navigation ────────────────────────────────────────────

test.describe('Session Keyboard Navigation', () => {
  test('should navigate sessions with Alt+Arrow shortcuts', async () => {
    // Ensure broomy is the active session
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()
    await expect(broomySession).toHaveClass(/bg-accent\/15/)

    // Alt+ArrowDown should switch to the next session
    await page.keyboard.press('Alt+ArrowDown')

    // backend-api should now be the active session
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await expect(backendSession).toHaveClass(/bg-accent\/15/)

    // Alt+ArrowUp should switch back
    await page.keyboard.press('Alt+ArrowUp')
    await expect(broomySession).toHaveClass(/bg-accent\/15/)
  })
})
