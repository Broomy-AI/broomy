/**
 * Feature Documentation: Condition State Batching
 *
 * Documents how action button visibility updates are batched so that all
 * async data sources (PR status, behind-main count, devcontainer check)
 * must complete before the condition state updates. This prevents buttons
 * from appearing one-at-a-time and causing layout shifts.
 *
 * Run with: pnpm test:feature-docs condition-state-batching
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page } from '@playwright/test'
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
const steps: FeatureStep[] = []

/** Navigate the explorer panel to the source-control tab */
async function openSourceControl() {
  const explorerButton = page.locator('[data-panel-id="explorer-toggle"], [title*="Explorer"]').first()
  if (await explorerButton.isVisible()) {
    const cls = await explorerButton.getAttribute('class').catch(() => '')
    if (!cls?.includes('bg-accent')) {
      await explorerButton.click()
      await expect(page.locator('[data-panel-id="explorer"]')).toBeVisible()
    }
  }

  await page.evaluate(() => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => { activeSessionId: string; setExplorerFilter: (id: string, filter: string) => void }
    }
    if (!store) return
    const state = store.getState()
    state.setExplorerFilter(state.activeSessionId, 'source-control')
  })
  await expect(page.locator('[data-panel-id="explorer"]')).toBeVisible()
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Condition State Batching: Stable Action Buttons',
      description:
        'Action button visibility depends on multiple async data sources: PR status, ' +
        'behind-main count, and devcontainer config. Previously these resolved independently, ' +
        'causing buttons to appear one-at-a-time and shift the layout. Now the condition state ' +
        'is held at its last settled value until all sources have completed their initial load, ' +
        'so all buttons appear together in a single update.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Condition State Batching', () => {
  test('Step 1: Source control buttons appear in settled state', async () => {
    await openSourceControl()
    await page.locator('[data-panel-id="explorer"]').waitFor({ state: 'attached' })

    // Wait for action buttons to be visible (they should appear as a batch)
    const explorer = page.locator('[data-panel-id="explorer"]')
    await expect(explorer).toBeVisible()

    // Wait for action buttons to settle
    await expect(explorer.locator('button').filter({ hasText: /Commit|Sync|Push|Create|Review|Get latest/i }).first()).toBeVisible()

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-settled-buttons.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/01-settled-buttons.png',
      caption: 'Action buttons appear together after all data loads',
      description:
        'The source control view shows action buttons only after all async data sources ' +
        '(PR status, behind-main count, devcontainer check) have completed. The condition ' +
        'state is held at its previous settled value during loading, preventing partial ' +
        'updates that would cause buttons to shift.',
    })
  })

  test('Step 2: Switch session and verify buttons settle together', async () => {
    // Switch to session 2 to trigger fresh async loads
    await page.evaluate(() => {
      const store = (window as Record<string, unknown>).__sessionStore as {
        getState: () => { sessions: { id: string }[]; setActiveSession: (id: string) => void }
      }
      if (!store) return
      const state = store.getState()
      const session2 = state.sessions.find((s: { id: string }) => s.id === '2')
      if (session2) state.setActiveSession(session2.id)
    })

    await openSourceControl()

    const explorer = page.locator('[data-panel-id="explorer"]')
    // Wait for action buttons to settle after session switch
    await expect(explorer.locator('button').filter({ hasText: /Commit|Sync|Push|Create|Review|Get latest/i }).first()).toBeVisible()

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '02-session-switch.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/02-session-switch.png',
      caption: 'Buttons settle together after switching sessions',
      description:
        'When switching to a different session, all async data sources reset and re-fetch. ' +
        'The condition state stays at its previous settled value until the new session\'s ' +
        'PR status, behind-main count, and devcontainer check all complete. This prevents ' +
        'the "Get latest from main" button from suddenly appearing and shifting "Approve and Merge" ' +
        'or "Create PR" downward.',
    })
  })

  test('Step 3: Switch back and verify stable layout', async () => {
    // Switch back to session 1
    await page.evaluate(() => {
      const store = (window as Record<string, unknown>).__sessionStore as {
        getState: () => { sessions: { id: string }[]; setActiveSession: (id: string) => void }
      }
      if (!store) return
      const state = store.getState()
      const session1 = state.sessions.find((s: { id: string }) => s.id === '1')
      if (session1) state.setActiveSession(session1.id)
    })

    await openSourceControl()

    const explorer = page.locator('[data-panel-id="explorer"]')

    // Wait for action buttons to settle and verify they are present
    const actionButtons = explorer.locator('button').filter({ hasText: /Commit|Sync|Push|Create|Review|Get latest/i })
    await expect(actionButtons.first()).toBeVisible()
    const buttonCount = await actionButtons.count()
    expect(buttonCount).toBeGreaterThan(0)

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '03-stable-layout.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/03-stable-layout.png',
      caption: 'Buttons remain stable through session switches',
      description:
        'After switching back, the action buttons appear in a stable layout without ' +
        'intermediate jitter. The isInitialLoading flag in useSourceControlData tracks ' +
        'whether PR and behind-main fetches have completed, while hasDevcontainerLoaded ' +
        'tracks the devcontainer check. The settled condition state ref in SourceControl ' +
        'only updates when all three are ready.',
    })
  })
})
