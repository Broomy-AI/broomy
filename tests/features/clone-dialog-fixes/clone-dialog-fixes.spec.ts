/**
 * Feature Documentation: Clone Repo Dialog — Bullet-Proof UX
 *
 * Walks through the inline guidance, validation, and folder hints that
 * keep first-time users from getting stuck on the Clone Repository view
 * inside the New Session dialog.
 *
 * Run with: pnpm test:feature-docs clone-dialog-fixes
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page, ElectronApplication } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotElement } from '../_shared/screenshot-helpers'
import { generateFeaturePage, generateIndex, FeatureStep } from '../_shared/template'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FEATURE_DIR = __dirname
const SCREENSHOTS = path.join(FEATURE_DIR, 'screenshots')
const FEATURES_ROOT = path.join(__dirname, '..')

let page: Page
let electronApp: ElectronApplication
const steps: FeatureStep[] = []

/** Replace an IPC handler in the main process with a custom response. */
async function overrideIpcHandler(channel: string, response: unknown) {
  await electronApp.evaluate(({ ipcMain }, { ch, resp }) => {
    ipcMain.removeHandler(ch)
    ipcMain.handle(ch, () => resp)
  }, { ch: channel, resp: response })
}

/**
 * Replace fs:exists with a function that returns true only for paths matching
 * the given predicate. Use this to drive the "folder will be created" and
 * "target already exists" UI states without touching the real filesystem.
 */
async function overrideFsExists(matcher: 'all' | 'none' | 'location-only' | 'target-only', location: string, repoName: string) {
  await electronApp.evaluate(({ ipcMain }, args) => {
    ipcMain.removeHandler('fs:exists')
    const target = `${args.location}/${args.repoName}`
    ipcMain.handle('fs:exists', (_event, p: string) => {
      if (args.matcher === 'all') return true
      if (args.matcher === 'none') return false
      if (args.matcher === 'location-only') return p === args.location
      if (args.matcher === 'target-only') return p === target
      return false
    })
  }, { matcher, location, repoName })
}

async function restoreFsExists() {
  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('fs:exists')
    // Default E2E mock returns true (exists)
    ipcMain.handle('fs:exists', () => true)
  })
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page, electronApp } = await resetApp())
})

test.afterAll(async () => {
  await restoreFsExists()
  await generateFeaturePage(
    {
      title: 'Clone Dialog — Bullet-Proof UX',
      description:
        'The Clone Repository view inside the New Session dialog now guides users through ' +
        'every common mistake. The path preview is always visible (with placeholders before ' +
        'fields are filled), the disabled Clone button always explains why it\'s disabled, ' +
        'and the location field tells you whether the folder will be created, already exists, ' +
        'or collides with an existing target.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

async function openCloneDialog() {
  const newSessionBtn = page.locator('button:has-text("+ New Session")')
  await newSessionBtn.click()
  await expect(page.locator('h2:has-text("New Session")')).toBeVisible()
  await page.locator('button:has-text("Clone")').click()
  await expect(page.locator('h2:has-text("Clone Repository")')).toBeVisible()
}

async function closeDialog() {
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
}

test.describe.serial('Feature: Clone Dialog Fixes', () => {
  test('Step 1: Empty form — preview placeholder + blocking reason', async () => {
    await openCloneDialog()

    // Path preview is visible from the start, even with no URL typed.
    await expect(page.getByText('<repo>/main', { exact: false })).toBeVisible()
    // Blocking reason explains why Clone is disabled.
    await expect(page.getByText(/Enter a repository URL/i)).toBeVisible()

    const dialog = page.locator('.fixed.inset-0').first()
    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '01-empty-form.png'))
    steps.push({
      screenshotPath: 'screenshots/01-empty-form.png',
      caption: 'Initial state — preview placeholder and inline blocking reason',
      description:
        'With no URL entered, the path preview shows the location with <repo>/main/ as ' +
        'a placeholder so the user can see exactly where the clone will land. The text ' +
        'above the disabled Clone button explains it\'s waiting for a URL — no more silent ' +
        'greyed-out button.',
    })
  })

  test('Step 2: Pasting a GitHub tree URL produces a specific error', async () => {
    const urlInput = page.locator('input[placeholder*="https://github.com"]')
    await urlInput.fill('https://github.com/user/my-repo/tree/main')

    // Inline error appears under the URL input.
    await expect(page.getByText(/tree page, not a clone URL/i).first()).toBeVisible()
    // Clone button stays disabled.
    const cloneBtn = page.locator('button:has-text("Clone")').last()
    await expect(cloneBtn).toBeDisabled()

    const dialog = page.locator('.fixed.inset-0').first()
    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '02-tree-url-rejected.png'))
    steps.push({
      screenshotPath: 'screenshots/02-tree-url-rejected.png',
      caption: 'GitHub web-UI URLs are rejected with a helpful suggestion',
      description:
        'Pasting a /tree/, /blob/, /pulls/, or /issues/ URL is a common mistake — git ' +
        'clone would fail with a cryptic 404. Broomy detects these and points to the ' +
        'correct clone URL inline.',
    })
  })

  test('Step 3: Valid URL with non-existent location — "folder will be created"', async () => {
    // Force fs:exists to return false so we get the "will be created" hint.
    await overrideFsExists('none', '', '')

    const urlInput = page.locator('input[placeholder*="https://github.com"]')
    await urlInput.fill('https://github.com/user/my-repo.git')

    // Path preview now shows the actual repo name.
    await expect(page.getByText(/my-repo\/main/).first()).toBeVisible()
    // "Folder will be created" hint appears under the location field.
    await expect(page.getByText(/will be created/i)).toBeVisible({ timeout: 3000 })

    const dialog = page.locator('.fixed.inset-0').first()
    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '03-folder-will-be-created.png'))
    steps.push({
      screenshotPath: 'screenshots/03-folder-will-be-created.png',
      caption: 'Missing parent folder is announced — and the IPC handler creates it',
      description:
        'When the chosen location doesn\'t exist yet, the dialog says so explicitly. ' +
        'Previously, clone would silently fail with a cryptic git error. The clone ' +
        'handler now mkdir -p\'s the parent before invoking simple-git.',
    })
  })

  test('Step 4: Target folder collision — clear blocker', async () => {
    // Both location AND target exist — should block with collision message.
    await overrideFsExists('all', '', '')

    // Force a re-evaluation by tweaking the URL.
    const urlInput = page.locator('input[placeholder*="https://github.com"]')
    await urlInput.fill('')
    await urlInput.fill('https://github.com/user/my-repo.git')

    await expect(page.getByText(/already exists/i).first()).toBeVisible({ timeout: 3000 })
    const cloneBtn = page.locator('button:has-text("Clone")').last()
    await expect(cloneBtn).toBeDisabled()

    const dialog = page.locator('.fixed.inset-0').first()
    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '04-target-exists.png'))
    steps.push({
      screenshotPath: 'screenshots/04-target-exists.png',
      caption: 'Target folder collision blocks Clone with a specific message',
      description:
        'If a folder with the same repo name already lives at the location, the dialog ' +
        'flags the collision and disables Clone. The blocking reason above the button ' +
        'tells the user to pick a different location or remove the existing folder.',
    })
  })

  test('Step 5: Ready to clone — preview shows full destination path', async () => {
    // Restore so location exists, target does not — clean ready state.
    await overrideFsExists('location-only', '/Users/test/repos', 'my-repo')

    const locationInput = page.locator('input').nth(1)
    await locationInput.fill('/Users/test/repos')

    const urlInput = page.locator('input[placeholder*="https://github.com"]')
    await urlInput.fill('')
    await urlInput.fill('https://github.com/user/my-repo.git')

    // Path preview shows the precise destination, including /main/.
    await expect(page.locator('span.font-mono').filter({ hasText: /my-repo\/main\/$/ })).toBeVisible({ timeout: 3000 })
    const cloneBtn = page.locator('button:has-text("Clone")').last()
    await expect(cloneBtn).toBeEnabled()

    const dialog = page.locator('.fixed.inset-0').first()
    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '05-ready-to-clone.png'))
    steps.push({
      screenshotPath: 'screenshots/05-ready-to-clone.png',
      caption: 'All inputs valid — Clone button is enabled and the path is unambiguous',
      description:
        'With a valid URL, an existing location, and no target collision, the Clone ' +
        'button enables and the preview shows the full destination path. The "Why /main/?" ' +
        'tooltip explains the worktree convention so users aren\'t surprised by the subfolder.',
    })

    await closeDialog()
  })
})
