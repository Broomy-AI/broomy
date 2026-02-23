/**
 * Feature Documentation: Simple Merge Commit
 *
 * Exercises the merge commit UI in source control, showing:
 * - "Resolve Conflicts" button when files contain conflict markers
 * - "Commit Merge" button when conflicts are resolved (even if not yet staged)
 *
 * Conflict detection checks actual file contents for <<<<<<< markers rather than
 * git index status, so files resolved by an agent but not staged are correctly
 * recognized as resolved. The user clicks "Resolve Conflicts" to ask the agent —
 * this is no longer done automatically on sync.
 *
 * Run with: pnpm test:feature-docs simple-merge-commit
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
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

const steps: FeatureStep[] = []

test.setTimeout(60000)

/** Navigate the explorer panel to the source-control tab */
async function openSourceControl(page: Page) {
  // Ensure explorer panel is open
  const explorerButton = page.locator('[data-panel-id="explorer-toggle"], [title*="Explorer"]').first()
  if (await explorerButton.isVisible()) {
    const cls = await explorerButton.getAttribute('class').catch(() => '')
    if (!cls?.includes('bg-accent')) {
      await explorerButton.click()
      await page.waitForTimeout(300)
    }
  }

  // Switch to source-control filter via store
  await page.evaluate(() => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => { activeSessionId: string; setExplorerFilter: (id: string, filter: string) => void }
    }
    if (!store) return
    const state = store.getState()
    state.setExplorerFilter(state.activeSessionId, 'source-control')
  })
  await page.waitForTimeout(500)
}

function launchApp(mockMerge: string) {
  return electron.launch({
    args: [path.join(__dirname, '..', '..', '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      E2E_TEST: 'true',
      E2E_HEADLESS: process.env.E2E_HEADLESS ?? 'true',
      SCREENSHOT_MODE: 'true',
      E2E_MOCK_MERGE: mockMerge,
    },
  })
}

async function waitForApp(page: Page) {
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root > div', { timeout: 15000 })
  await page.waitForTimeout(3000)
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Simple Merge Commit',
      description:
        'When a git merge is in progress, the source control panel detects the merge state and adapts the UI. ' +
        'Conflict detection reads actual file contents for <<<<<<< markers, so files resolved by an agent ' +
        'but not yet staged are correctly recognized as resolved. ' +
        'If conflicts remain, a "Resolve Conflicts" button lets the user ask the agent to fix them. ' +
        'Once resolved, the button becomes "Commit Merge" — clicking it ' +
        'stages all files and commits the merge with the auto-generated merge message.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Simple Merge Commit', () => {
  test('Step 1: Merge with unresolved conflicts', async () => {
    const electronApp = await launchApp('conflicts')
    const page = await electronApp.firstWindow()
    await waitForApp(page)
    await openSourceControl(page)

    // Verify merge banner
    const mergeBanner = page.locator('text=Merge in progress')
    await expect(mergeBanner).toBeVisible({ timeout: 5000 })

    // Verify "Resolve Conflicts" button is enabled (can be clicked to ask agent)
    const resolveBtn = page.locator('button:has-text("Resolve Conflicts")')
    await expect(resolveBtn).toBeVisible()
    await expect(resolveBtn).toBeEnabled()

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-merge-conflicts.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/01-merge-conflicts.png',
      caption: 'Merge with unresolved conflicts',
      description:
        'When a merge has unresolved conflicts (detected by checking file contents for <<<<<<< markers), ' +
        'the source control panel shows a yellow "Merge in progress" banner and an orange ' +
        '"Resolve Conflicts" button. Clicking it asks the agent to resolve the conflicts.',
    })

    await electronApp.close()
  })

  test('Step 2: Conflicts resolved — Commit Merge available', async () => {
    const electronApp = await launchApp('true')
    const page = await electronApp.firstWindow()
    await waitForApp(page)
    await openSourceControl(page)

    // Verify resolved banner (green text)
    const resolvedBanner = page.locator('text=Merge conflicts resolved')
    await expect(resolvedBanner).toBeVisible({ timeout: 5000 })

    // Verify "Commit Merge" button is enabled
    const commitMergeBtn = page.locator('button:has-text("Commit Merge")')
    await expect(commitMergeBtn).toBeVisible()
    await expect(commitMergeBtn).toBeEnabled()

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '02-commit-merge.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/02-commit-merge.png',
      caption: 'Conflicts resolved — Commit Merge button enabled',
      description:
        'Once all conflict markers are removed from files (even if the files haven\'t been staged yet), ' +
        'the button changes to "Commit Merge". Clicking it stages all files and commits the merge ' +
        'using the auto-generated merge message. No manual commit message is needed.',
    })

    await electronApp.close()
  })

  test('Step 3: File lists visible during merge', async () => {
    const electronApp = await launchApp('true')
    const page = await electronApp.firstWindow()
    await waitForApp(page)
    await openSourceControl(page)

    // Verify file lists are visible
    const stagedSection = page.getByText(/^Staged Changes \(\d+\)$/)
    await expect(stagedSection).toBeVisible()

    const changesSection = page.getByText(/^Changes \(\d+\)$/)
    await expect(changesSection).toBeVisible()

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '03-merge-file-lists.png'))
    steps.push({
      screenshotPath: 'screenshots/03-merge-file-lists.png',
      caption: 'Staged and unstaged changes during merge',
      description:
        'During a merge, the file list shows staged changes (auto-merged by git) and ' +
        'unstaged changes (files where conflicts were resolved). ' +
        'The "Commit Merge" button stages all files automatically before committing.',
    })

    await electronApp.close()
  })
})
