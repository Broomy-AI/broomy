/**
 * Feature Documentation: filter the repo list in the New Session dialog (#188)
 *
 * With many managed repos, finding one in the New Session dialog meant scrolling or pressing the arrow
 * keys repeatedly. From six repos on, a filter box sits in the dialog header: `/` focuses it, typing
 * narrows the list, Enter goes back to the single-key shortcuts with the filter kept (so N / E / I / R / O
 * act on the match), and Escape clears the filter before it closes the dialog. The dialog keeps its size
 * while you type, so the box doesn't move under the caret.
 *
 * Run with: pnpm test:feature-docs new-session-filter
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

// The shared fixture emulates this viewport for every feature doc
const FIXTURE_VIEWPORT = { width: 1400, height: 900 }

type RepoState = { repos: Record<string, unknown>[]; ghAvailable: boolean | null }
type RepoStoreHandle = { getState: () => RepoState; setState: (state: Partial<RepoState>) => void }
type Box = { x: number; y: number; width: number; height: number }

// Realistic names so the filter has something to match; demo-project (from the E2E config) comes first
const EXTRA_REPOS = [
  'web-app', 'api-gateway', 'billing-service', 'mobile-ios', 'mobile-android', 'design-system',
  'auth-service', 'docs-site', 'infra', 'analytics-api', 'notifications', 'search-service', 'admin-portal',
]

let page: Page
let electronApp: ElectronApplication
let savedRepos: RepoState | null = null
let fullBox: Box | null = null
const steps: FeatureStep[] = []

const dialog = () => page.locator('[role="dialog"]')
const repoRows = () => dialog().locator('[data-repo-row]')
const heading = () => dialog().locator('h2:has-text("New Session")')
const filterInput = () => dialog().getByRole('textbox', { name: 'Filter repositories' })

async function setRepos(state: RepoState) {
  await page.evaluate((s) => {
    ((window as unknown as Record<string, unknown>).__repoStore as RepoStoreHandle).setState(s)
  }, state)
}

/** Add the extra repos to the store (restored in afterAll). setState skips config saves. */
async function injectRepos() {
  savedRepos ??= await page.evaluate(() => {
    const { repos, ghAvailable } = ((window as unknown as Record<string, unknown>).__repoStore as RepoStoreHandle).getState()
    return { repos, ghAvailable }
  })
  const extra = EXTRA_REPOS.map(name => ({ id: name, name, remoteUrl: '', rootDir: `/nonexistent/${name}`, defaultBranch: 'main' }))
  await setRepos({ repos: [...savedRepos.repos, ...extra], ghAvailable: true })
}

async function expectSameBox(before: Box) {
  const after = (await dialog().boundingBox())!
  for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(after[key] - before[key])).toBeLessThanOrEqual(1)
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

async function openDialogWithFilter(text: string) {
  await page.locator('button:has-text("+ New Session")').click()
  await expect(heading()).toBeVisible()
  await heading().click()
  await page.keyboard.press('/')
  await page.keyboard.type(text)
}

async function shoot(file: string, caption: string, description: string) {
  // Keep the pointer off the dialog so no button is caught in its hover state
  await page.mouse.move(0, 0)
  await screenshotElement(page, dialog(), path.join(SCREENSHOTS, file))
  steps.push({ screenshotPath: `screenshots/${file}`, caption, description })
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page, electronApp } = await resetApp())
})

test.afterAll(async () => {
  for (let i = 0; i < 3 && await dialog().count() > 0; i++) await page.keyboard.press('Escape')
  if (savedRepos) await setRepos(savedRepos)
  await generateFeaturePage(
    {
      title: 'New Session Dialog — Filter Repos',
      description:
        'With many managed repos, finding one in the New Session dialog meant scrolling or pressing the arrow ' +
        'keys repeatedly (#188). From six repos on, a filter box sits in the dialog header. "/" focuses it, ' +
        'typing narrows the list by name, Enter goes back to the single-key shortcuts with the filter kept — ' +
        'so N / E / I / R / O act on the match — and Escape clears the filter before it closes the dialog. ' +
        'The dialog keeps its size while you type, so the box never moves under the caret.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: filter the repo list in the New Session dialog', () => {
  test('Step 1: with many repos, the header shows a filter box', async () => {
    await injectRepos()
    await page.locator('button:has-text("+ New Session")').click()
    await expect(heading()).toBeVisible()
    // Click into the dialog so the keys go to it, not to whatever the app focused behind it
    await heading().click()
    await expect(dialog()).toBeFocused()

    await expect(repoRows()).toHaveCount(EXTRA_REPOS.length + 1)
    await expect(filterInput()).toBeVisible()
    await expect(filterInput()).not.toBeFocused()
    fullBox = (await dialog().boundingBox())!

    await shoot('01-filter-box.png', 'Fourteen repos: a filter box in the header',
      'From six repos on, the header carries a filter box with a "/" hint. It does not take the focus when ' +
      'the dialog opens, so the single-key shortcuts (C / A / F, and N / E / I / R / O on the highlighted ' +
      'repo) work exactly as before.')
  })

  test('Step 2: / focuses the box without typing the slash', async () => {
    await page.keyboard.press('/')
    await expect(filterInput()).toBeFocused()
    await expect(filterInput()).toHaveValue('')

    await shoot('02-slash-focuses.png', '"/" jumps to the filter',
      'Pressing "/" focuses the box (and the slash is not typed). From here on letters type into the box ' +
      'instead of triggering shortcuts.')
  })

  test('Step 3: typing narrows the list; the dialog keeps its size', async () => {
    // Every letter types: n, e, r, o, i... must not open a view
    await page.keyboard.type('service')
    await expect(heading()).toBeVisible()
    // billing-service, auth-service, search-service
    await expect(repoRows()).toHaveCount(3)
    await expect(repoRows().first()).toHaveAttribute('aria-label', 'billing-service')
    await expect(repoRows().first()).toHaveClass(/border-accent/)
    await expectSameBox(fullBox!)

    await shoot('03-filtered.png', 'Typing "service" leaves three repos, the first one highlighted',
      'The list keeps only the repos whose name contains the text (case-insensitive), and the first match is ' +
      'highlighted. The dialog keeps the size it had before filtering, so the box stays exactly where it was ' +
      'while you type.')
  })

  test('Step 4: the arrow keys move the highlight among the matches', async () => {
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(repoRows().nth(2)).toHaveClass(/border-accent/)
    await expect(repoRows().nth(2)).toHaveAttribute('aria-label', 'search-service')
    await expect(filterInput()).toBeFocused()

    await shoot('04-arrow-keys.png', 'Arrow Down / Up pick a match while you keep typing',
      'The arrow keys move the highlight through the matches without leaving the box, so you can refine the ' +
      'text and the choice together.')
  })

  test('Step 5: Enter returns to the shortcuts; N acts on the highlighted match', async () => {
    await page.keyboard.press('Enter')
    await expect(dialog()).toBeFocused()
    await expect(filterInput()).toHaveValue('service')

    await page.keyboard.press('n')
    await expect(dialog().locator('h2:has-text("New Branch")')).toBeVisible()
    await expect(dialog().getByText('search-service', { exact: true })).toBeVisible()

    await shoot('05-n-on-match.png', 'Enter, then N: a new branch on search-service',
      'Enter leaves the box with the filter kept and hands the keyboard back to the single-key shortcuts. ' +
      'N / E / I / R / O then act on the highlighted match — here N opens New Branch for search-service.')
  })

  test('Step 6: no matches — the dialog says so and offers Clear filter', async () => {
    await page.keyboard.press('Escape')
    await expect(heading()).toBeVisible()
    // Coming back from a sub-view starts Home afresh, like the highlight always has
    await expect(filterInput()).toHaveValue('')

    await page.keyboard.press('/')
    await page.keyboard.type('zzz')
    await expect(repoRows()).toHaveCount(0)
    await expect(dialog().getByText(/No repositories match “zzz”/)).toBeVisible()
    await expect(dialog().getByRole('button', { name: 'Clear filter' })).toHaveCount(2)
    await expectSameBox(fullBox!)

    await shoot('06-no-matches.png', 'Nothing matches "zzz"',
      'The list is replaced by a message with a Clear filter button; the × in the box does the same. Enter ' +
      'does nothing here, and the repo shortcuts stay inert until something matches.')
  })

  test('Step 7: Escape clears the filter, and a second Escape closes the dialog', async () => {
    await page.keyboard.press('Escape')
    await expect(filterInput()).toHaveValue('')
    await expect(repoRows()).toHaveCount(EXTRA_REPOS.length + 1)
    await expect(dialog()).toHaveCount(1)
    await expectSameBox(fullBox!)

    await shoot('07-escape-clears.png', 'Escape clears the filter first',
      'The first Escape empties the box and brings every repo back; the dialog is still open. A second ' +
      'Escape closes it, as Escape always did.')

    await page.keyboard.press('Escape')
    await expect(dialog()).toHaveCount(0)
  })

  test('Step 8: the light theme', async () => {
    const original = await page.evaluate(() => document.documentElement.dataset.theme ?? null)
    try {
      await page.evaluate(() => { document.documentElement.dataset.theme = 'light' })
      await openDialogWithFilter('mobile')
      await expect(repoRows()).toHaveCount(2)
      await expect(repoRows().first()).toHaveClass(/border-accent/)

      await shoot('08-light-theme.png', 'The same filter in the light theme',
        'The box, its clear button and the highlight use the theme tokens, so they follow the light theme ' +
        '(and the high-contrast ones) like the rest of the dialog.')

      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      await expect(dialog()).toHaveCount(0)
    } finally {
      await page.evaluate((theme) => {
        if (theme === null) delete document.documentElement.dataset.theme
        else document.documentElement.dataset.theme = theme
      }, original)
    }
  })

  // Last step: it changes the viewport and zoom, and restores both before the next feature doc runs
  test('Step 9: the smallest supported window — 800×600 at 200%', async () => {
    const { zoom } = await electronApp.evaluate(({ BrowserWindow }) => ({
      zoom: BrowserWindow.getAllWindows()[0].webContents.getZoomFactor(),
    }))
    try {
      await page.setViewportSize({ width: 800, height: 600 })
      await setZoom(2)
      // The zoom reaches the renderer asynchronously; wait for the 400x300 logical viewport
      await expectLogicalSize(400, 300)

      await openDialogWithFilter('service')
      await expect(repoRows()).toHaveCount(3)
      const { width, height } = await logicalSize()
      const box = (await dialog().boundingBox())!
      expect(box.y).toBeGreaterThanOrEqual(-1)
      expect(box.y + box.height).toBeLessThanOrEqual(height + 1)
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1)
      await expect(filterInput()).toBeInViewport({ ratio: 1 })
      await expect(dialog().getByRole('button', { name: 'Cancel' })).toBeInViewport({ ratio: 1 })
      expect(await dialog().evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)

      await page.mouse.move(0, 0)
      await page.screenshot({ path: path.join(SCREENSHOTS, '09-smallest-window.png') })
      steps.push({
        screenshotPath: 'screenshots/09-smallest-window.png',
        caption: 'Whole window at the smallest supported size (400×300 logical)',
        description:
          'At an 800×600 window with 200% interface scale the title and the filter box still share the header ' +
          'without overflowing, Cancel stays visible, and the filtered list scrolls in between.',
      })

      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      await expect(dialog()).toHaveCount(0)
    } finally {
      await setZoom(zoom)
      await page.setViewportSize(FIXTURE_VIEWPORT)
      await expectLogicalSize(FIXTURE_VIEWPORT.width / zoom, FIXTURE_VIEWPORT.height / zoom)
    }
  })
})
