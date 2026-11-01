/**
 * Feature Documentation: New Session dialog with many repos (#184)
 *
 * With more managed repos than fit the window, the New Session dialog used to
 * spill past the top and bottom edges with nothing scrollable — the Clone /
 * Add Repo / Folder buttons and the lower repos were unreachable. The dialog
 * now stays inside the window: the title and Cancel stay put and the body
 * scrolls, with the mouse wheel and with the arrow keys.
 *
 * Run with: pnpm test:feature-docs new-session-scroll
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page, ElectronApplication, Locator } from '@playwright/test'
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

// The shared fixture emulates this viewport for every feature doc
const FIXTURE_VIEWPORT = { width: 1400, height: 900 }

type RepoState = { repos: Record<string, unknown>[]; ghAvailable: boolean | null }
type RepoStoreHandle = { getState: () => RepoState; setState: (state: Partial<RepoState>) => void }

let page: Page
let electronApp: ElectronApplication
let savedRepos: RepoState | null = null
const steps: FeatureStep[] = []

const dialog = () => page.locator('[role="dialog"]')
const repoRows = () => dialog().locator('[data-repo-row]')
const heading = () => dialog().locator('h2:has-text("New Session")')
const cancel = () => dialog().getByRole('button', { name: 'Cancel' })
// Home's scrolling body (the dialog shell itself is the locator root, so it never matches here)
const body = () => dialog().locator('.overflow-y-auto').filter({ has: page.locator('[data-repo-row]') })

async function setRepos(state: RepoState) {
  await page.evaluate((s) => {
    ((window as unknown as Record<string, unknown>).__repoStore as RepoStoreHandle).setState(s)
  }, state)
}

/** Add 30 fake repos to the store (restored in afterAll). setState skips config saves. */
async function injectRepos(ghAvailable: boolean) {
  savedRepos ??= await page.evaluate(() => {
    const { repos, ghAvailable } = ((window as unknown as Record<string, unknown>).__repoStore as RepoStoreHandle).getState()
    return { repos, ghAvailable }
  })
  const extra = Array.from({ length: 30 }, (_, i) => {
    const name = `project-${String(i + 1).padStart(2, '0')}`
    return { id: name, name, remoteUrl: '', rootDir: `/nonexistent/${name}`, defaultBranch: 'main' }
  })
  await setRepos({ repos: [...savedRepos.repos, ...extra], ghAvailable })
}

async function logicalSize() {
  return page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
}

async function expectLogicalSize(width: number, height: number) {
  await expect.poll(async () => {
    const size = await logicalSize()
    return Math.abs(size.width - width) <= 2 && Math.abs(size.height - height) <= 2
  }, { message: `logical viewport should be ${width}x${height}` }).toBe(true)
}

async function setZoom(zoom: number) {
  await electronApp.evaluate(({ BrowserWindow }, z) => {
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(z)
  }, zoom)
}

async function openDialog() {
  await page.locator('button:has-text("+ New Session")').click()
  await expect(heading()).toBeVisible()
}

async function expectDialogInsideWindow() {
  const { width, height } = await logicalSize()
  const box = (await dialog().boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(-1)
  expect(box.y).toBeGreaterThanOrEqual(-1)
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(height + 1)
}

async function resetScroll(scroller: Locator) {
  await scroller.evaluate(el => { el.scrollTop = 0 })
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBe(0)
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page, electronApp } = await resetApp())
})

test.afterAll(async () => {
  if (await dialog().count() > 0) await page.keyboard.press('Escape')
  if (savedRepos) await setRepos(savedRepos)
  await generateFeaturePage(
    {
      title: 'New Session Dialog — Many Repos',
      description:
        'With more managed repos than fit the window, the New Session dialog used to spill past the top and ' +
        'bottom of the window with nothing to scroll, so the Clone / Add Repo / Folder buttons and the lower ' +
        'repos were unreachable (#184). The dialog now always fits inside the window: the title and Cancel ' +
        'stay put and the body in between scrolls — with the mouse wheel, and following the arrow-key ' +
        'highlight. It still fits at the smallest supported window (800×600 at 200% interface scale).',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: New Session dialog with many repos', () => {
  test('Step 1: 31 repos — the dialog fits and the top actions are visible', async () => {
    await injectRepos(true)
    await openDialog()

    await expectDialogInsideWindow()
    for (const name of ['Clone', 'Add Repo', 'Folder']) {
      await expect(dialog().getByRole('button', { name })).toBeInViewport({ ratio: 1 })
    }
    await expect(cancel()).toBeInViewport({ ratio: 1 })
    await expect(repoRows()).toHaveCount(31)
    await expect(repoRows().last()).not.toBeInViewport()

    await screenshotElement(page, dialog(), path.join(SCREENSHOTS, '01-many-repos-fit.png'))
    steps.push({
      screenshotPath: 'screenshots/01-many-repos-fit.png',
      caption: '31 repos: the dialog stays inside the window',
      description:
        'The dialog is capped to the window height. The title, the Clone / Add Repo / Folder row and Cancel ' +
        'are all on screen; the repos that don\'t fit are below the fold of the scrolling body instead of ' +
        'off the edge of the window.',
    })
  })

  test('Step 2: the mouse wheel scrolls the body; title and Cancel stay put', async () => {
    await resetScroll(body())
    await body().hover()
    await page.mouse.wheel(0, 5000)
    await expect.poll(() => body().evaluate(el => el.scrollTop)).toBeGreaterThan(0)

    await expect(repoRows().last()).toBeInViewport({ ratio: 1 })
    await expect(heading()).toBeInViewport({ ratio: 1 })
    await expect(cancel()).toBeInViewport({ ratio: 1 })

    await screenshotElement(page, dialog(), path.join(SCREENSHOTS, '02-scrolled-to-bottom.png'))
    steps.push({
      screenshotPath: 'screenshots/02-scrolled-to-bottom.png',
      caption: 'Scrolled to the bottom with the mouse wheel',
      description:
        'Only the body between the title and the footer scrolls, so the last repo is reachable while ' +
        '"New Session" and Cancel stay where they are.',
    })
  })

  test('Step 3: the arrow keys scroll the highlighted repo into view', async () => {
    await resetScroll(body())
    // Click into the dialog first so the keys go to it, not to whatever the app focused behind it
    await heading().click()
    await expect(dialog()).toBeFocused()
    for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowDown')

    const lastRow = repoRows().last()
    await expect(lastRow).toHaveClass(/border-accent/)
    await expect(lastRow).toBeInViewport({ ratio: 1 })
    await expect(heading()).toBeInViewport({ ratio: 1 })

    await screenshotElement(page, dialog(), path.join(SCREENSHOTS, '03-arrow-key-highlight.png'))
    steps.push({
      screenshotPath: 'screenshots/03-arrow-key-highlight.png',
      caption: 'Arrow keys: the highlighted repo is always on screen',
      description:
        'Arrow Down/Up move the highlight and scroll it into view, ring included. N / E / I / R / O act on ' +
        'the highlighted repo; if a row button has keyboard focus, the arrows carry the focus along so Enter ' +
        'acts on the same repo.',
    })

    await page.keyboard.press('Escape')
    await expect(dialog()).toHaveCount(0)
  })

  // Last step: it changes the viewport and zoom, and restores both before the next feature doc runs
  test('Step 4: the smallest supported window — 800×600 at 200%', async () => {
    const { zoom } = await electronApp.evaluate(({ BrowserWindow }) => ({
      zoom: BrowserWindow.getAllWindows()[0].webContents.getZoomFactor(),
    }))
    try {
      await injectRepos(false)
      await page.setViewportSize({ width: 800, height: 600 })
      await setZoom(2)
      // The zoom reaches the renderer asynchronously; wait for the 400x300 logical viewport
      await expectLogicalSize(400, 300)

      await openDialog()
      await expectDialogInsideWindow()
      await expect(heading()).toBeInViewport({ ratio: 1 })
      await expect(cancel()).toBeInViewport({ ratio: 1 })
      await expect(dialog().getByRole('button', { name: 'Clone' })).toBeInViewport({ ratio: 1 })

      // Move the pointer off the dialog so Clone isn't shown in its hover state
      await page.mouse.move(0, 0)
      await page.screenshot({ path: path.join(SCREENSHOTS, '04-smallest-window.png') })
      steps.push({
        screenshotPath: 'screenshots/04-smallest-window.png',
        caption: 'Whole window at the smallest supported size (400×300 logical)',
        description:
          'At an 800×600 window with 200% interface scale the dialog still fits: the title, the Clone / Add Repo / ' +
          'Folder row and Cancel are visible, and the body scrolls to the repos and, further down, the ' +
          '"GitHub CLI not found" hint (the CLI is missing in this run).',
      })

      await page.keyboard.press('Escape')
      await expect(dialog()).toHaveCount(0)
    } finally {
      await setZoom(zoom)
      await page.setViewportSize(FIXTURE_VIEWPORT)
      await expectLogicalSize(FIXTURE_VIEWPORT.width / zoom, FIXTURE_VIEWPORT.height / zoom)
    }
  })
})
