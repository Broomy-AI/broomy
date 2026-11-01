import { test, expect, _electron as electron, ElectronApplication, Locator, Page } from '@playwright/test'
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

    // The "demo-project" repo should be visible from mock data (scope to the dialog —
    // the sidebar now shows repo names in group headers too).
    await expect(page.locator('[role="dialog"]').getByText('demo-project')).toBeVisible()

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

  test('should refetch with a different filter when a mode tab is clicked', async () => {
    await openNewSessionDialog()
    await page.locator('button[title="Review pull requests"]').click()

    // Team mode is the default and excludes PRs nobody asked us to review
    await expect(page.locator('text=Add dark mode support').first()).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Bump dependencies')).toHaveCount(0)

    // All mode lists every open PR
    await page.locator('[role="tab"]:has-text("All")').click()
    await expect(page.locator('text=Bump dependencies').first()).toBeVisible({ timeout: 5000 })

    await page.keyboard.press('Escape')
    await expect(page.locator('h2:has-text("New Session")')).toBeVisible()

    await closeDialog()
  })

  // ── #184: the dialog must stay inside the window, however many repos and however small the window ──

  type RepoState = { repos: Record<string, unknown>[]; ghAvailable: boolean | null }
  type WindowState = { width: number; height: number; zoom: number }
  type RepoStoreHandle = { getState: () => RepoState; setState: (state: Partial<RepoState>) => void }

  let savedRepos: RepoState | null = null
  let savedWindow: WindowState | null = null
  let openFolderOverridden = false

  const dialog = () => page.locator('[role="dialog"]')
  const repoRows = () => dialog().locator('[data-repo-row]')
  // Home's scrolling body (the dialog shell itself is the locator root, so it never matches here)
  const homeBody = () => dialog().locator('.overflow-y-auto').filter({ has: page.locator('[data-repo-row]') })
  const homeHeading = () => dialog().locator('h2:has-text("New Session")')
  const homeCancel = () => dialog().getByRole('button', { name: 'Cancel' })

  /** Append `count` fake repos (restored in afterEach). setState skips config saves, and nothing touches their rootDirs. */
  async function injectRepos(count: number, ghAvailable = true) {
    savedRepos ??= await page.evaluate(() => {
      const { repos, ghAvailable } = ((window as unknown as Record<string, unknown>).__repoStore as RepoStoreHandle).getState()
      return { repos, ghAvailable }
    })
    await page.evaluate(({ count, ghAvailable, original }) => {
      const extra = Array.from({ length: count }, (_, i) => {
        const name = `scroll-repo-${String(i + 1).padStart(2, '0')}`
        return { id: name, name, remoteUrl: '', rootDir: `/nonexistent/${name}`, defaultBranch: 'main' }
      })
      ;((window as unknown as Record<string, unknown>).__repoStore as RepoStoreHandle).setState({ repos: [...original, ...extra], ghAvailable })
    }, { count, ghAvailable, original: savedRepos.repos })
  }

  async function expectLogicalSize(width: number, height: number) {
    await expect.poll(async () => {
      const [w, h] = await page.evaluate(() => [innerWidth, innerHeight])
      return Math.abs(w - width) <= 2 && Math.abs(h - height) <= 2
    }, { message: `logical viewport should be ${width}x${height}` }).toBe(true)
  }

  /** Resize the real window (restored in afterEach). No page.setViewportSize: its emulation override would outlive the test. */
  async function setWindow(width: number, height: number, zoom: number) {
    savedWindow ??= await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      const [w, h] = win.getContentSize()
      return { width: w, height: h, zoom: win.webContents.getZoomFactor() }
    })
    await electronApp.evaluate(({ BrowserWindow }, size) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.setContentSize(size.width, size.height)
      win.webContents.setZoomFactor(size.zoom)
    }, { width, height, zoom })
    await expectLogicalSize(width / zoom, height / zoom)
  }

  /** Make the folder picker return `folder` instead of opening a native dialog (restored in afterEach). */
  async function overrideOpenFolder(folder: string) {
    openFolderOverridden = true
    await electronApp.evaluate(({ ipcMain }, dir) => {
      ipcMain.removeHandler('dialog:openFolder')
      ipcMain.handle('dialog:openFolder', () => dir)
    }, folder)
  }

  async function expectDialogInsideWindow() {
    const [width, height] = await page.evaluate(() => [innerWidth, innerHeight])
    const box = (await dialog().boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(-1)
    expect(box.y).toBeGreaterThanOrEqual(-1)
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1)
    expect(box.y + box.height).toBeLessThanOrEqual(height + 1)
  }

  async function expectReachable(target: Locator) {
    // Centre it in every scroll container: Playwright's edge alignment can leave a 1px sliver under the dialog's border at 200%
    await target.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }))
    await expect(target).toBeInViewport({ ratio: 1 })
  }

  async function resetScroll(scroller: Locator) {
    await scroller.evaluate(el => { el.scrollTop = 0 })
    await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBe(0)
  }

  /** Run every cleanup step even if an earlier one throws, then rethrow the first failure. */
  async function runAll(steps: (() => Promise<unknown>)[]) {
    const errors: unknown[] = []
    for (const step of steps) {
      try { await step() } catch (err) { errors.push(err) }
    }
    if (errors.length > 0) throw errors[0]
  }

  test.afterEach(async () => {
    await runAll([
      async () => {
        // A sub-view's Escape goes back to Home; Home's closes the dialog
        for (let i = 0; i < 3 && await dialog().count() > 0; i++) await page.keyboard.press('Escape')
        await expect(dialog()).toHaveCount(0)
      },
      async () => {
        if (!savedRepos) return
        const original = savedRepos
        savedRepos = null
        await page.evaluate((state) => {
          ((window as unknown as Record<string, unknown>).__repoStore as RepoStoreHandle).setState(state)
        }, original)
      },
      async () => {
        if (!openFolderOverridden) return
        openFolderOverridden = false
        // The original handler can't be re-captured; null = "cancelled", and E2E must never open a native picker anyway
        await electronApp.evaluate(({ ipcMain }) => {
          ipcMain.removeHandler('dialog:openFolder')
          ipcMain.handle('dialog:openFolder', () => null)
        })
      },
      async () => {
        if (!savedWindow) return
        const original = savedWindow
        savedWindow = null
        await electronApp.evaluate(({ BrowserWindow }, size) => {
          const win = BrowserWindow.getAllWindows()[0]
          win.webContents.setZoomFactor(size.zoom)
          win.setContentSize(size.width, size.height)
        }, original)
        await expectLogicalSize(original.width / original.zoom, original.height / original.zoom)
      },
    ])
  })

  test('fits the window and scrolls with many repos (#184)', async () => {
    await injectRepos(30)
    const height = await page.evaluate(() => innerHeight)
    expect(31 * 58).toBeGreaterThan(height) // precondition: 31 rows really overflow this window

    await openNewSessionDialog()
    // The toolbar's window-drag strip must not swallow clicks on the top of the dialog
    await expect(dialog().locator('..')).toHaveCSS('-webkit-app-region', 'no-drag')
    await expectDialogInsideWindow()
    for (const name of ['Clone', 'Add Repo', 'Folder']) {
      await expect(dialog().getByRole('button', { name })).toBeInViewport({ ratio: 1 })
    }
    await expect(homeHeading()).toBeInViewport({ ratio: 1 })
    await expect(homeCancel()).toBeInViewport({ ratio: 1 })

    const body = homeBody()
    const lastRow = repoRows().last()
    await resetScroll(body)
    await expect(repoRows().first()).toBeInViewport({ ratio: 1 })
    await expect(lastRow).not.toBeInViewport()

    // Mouse wheel scrolls the body; title and Cancel stay put
    await body.hover()
    await page.mouse.wheel(0, 5000)
    await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
    await expect(lastRow).toBeInViewport({ ratio: 1 })
    await expect(homeHeading()).toBeInViewport({ ratio: 1 })
    await expect(homeCancel()).toBeInViewport({ ratio: 1 })

    // Arrow keys scroll the highlighted repo into view, ring included
    await resetScroll(body)
    for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowDown')
    await expect(lastRow).toHaveClass(/border-accent/)
    await expect(lastRow).toBeInViewport({ ratio: 1 })
    const rowBox = (await lastRow.boundingBox())!
    const bodyBox = (await body.boundingBox())!
    expect(rowBox.y - 1).toBeGreaterThanOrEqual(bodyBox.y)
    expect(rowBox.y + rowBox.height + 1).toBeLessThanOrEqual(bodyBox.y + bodyBox.height)
    await expect(homeHeading()).toBeInViewport({ ratio: 1 })
    await expect(homeCancel()).toBeInViewport({ ratio: 1 })

    await homeCancel().click()
    await expect(dialog()).toHaveCount(0)
  })

  test('Tab, arrow keys and Enter act on the highlighted repo (#184)', async () => {
    await injectRepos(30)
    await openNewSessionDialog()

    const newButtons = dialog().locator('button[title="Create a new branch worktree"]')
    await newButtons.first().focus()
    for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowDown')

    // Row 0 is demo-project, so row 20 is scroll-repo-20
    await expect(newButtons.nth(20)).toBeFocused()
    await expect(newButtons.nth(20)).toBeInViewport({ ratio: 1 })
    await expect(repoRows().nth(20)).toHaveClass(/border-accent/)

    await page.keyboard.press('Enter')
    await expect(dialog().locator('h2:has-text("New Branch")')).toBeVisible()
    await expect(dialog().getByText('scroll-repo-20', { exact: true })).toBeVisible()
  })

  test('a mouse click on a partly hidden repo row still lands (#184)', async () => {
    await injectRepos(30)
    await openNewSessionDialog()

    // Scroll so row 20 (below the fold) ends 12px under the body's bottom edge: its buttons are fully visible, the row isn't.
    // Clicking focuses the button on mousedown; nothing may scroll before mouseup, or the click is lost.
    const point = await homeBody().evaluate((body) => {
      const row = body.querySelectorAll<HTMLElement>('[data-repo-row]')[20]
      body.scrollTop += row.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom - 12
      const button = row.querySelector('button[title="Create a new branch worktree"]')!.getBoundingClientRect()
      return {
        x: button.left + button.width / 2, y: button.top + button.height * 0.75,
        rowBottom: row.getBoundingClientRect().bottom, buttonBottom: button.bottom, bodyBottom: body.getBoundingClientRect().bottom,
      }
    })
    expect(point.rowBottom).toBeGreaterThan(point.bodyBottom)
    expect(point.buttonBottom).toBeLessThanOrEqual(point.bodyBottom)

    await page.mouse.click(point.x, point.y)
    await expect(dialog().locator('h2:has-text("New Branch")')).toBeVisible()
    await expect(dialog().getByText('scroll-repo-20', { exact: true })).toBeVisible()
  })

  test('Tab and Shift+Tab wrap around the overflowing dialog (#184)', async () => {
    await injectRepos(30)
    await openNewSessionDialog()

    const clone = dialog().getByRole('button', { name: 'Clone' })
    await homeBody().evaluate(el => { el.scrollTop = el.scrollHeight })
    await expect(clone).not.toBeInViewport()

    await homeCancel().focus()
    await page.keyboard.press('Tab')
    await expect(clone).toBeFocused()
    await expect(clone).toBeInViewport({ ratio: 1 })

    await page.keyboard.press('Shift+Tab')
    await expect(homeCancel()).toBeFocused()
    await expect(homeCancel()).toBeInViewport({ ratio: 1 })
  })

  test('fits at the smallest supported size: 800x600 at 200% (#184)', async () => {
    await injectRepos(30, false)
    await setWindow(800, 600, 2)
    await openNewSessionDialog()

    await expectDialogInsideWindow()
    await expect(homeHeading()).toBeInViewport({ ratio: 1 })
    await expect(homeCancel()).toBeInViewport({ ratio: 1 })
    // Opens at the top of its body, even though the first repo row doesn't fully fit yet
    await expect(dialog().getByRole('button', { name: 'Clone' })).toBeInViewport({ ratio: 1 })

    // Header, scrolling body and footer stack without overlapping, and nothing scrolls sideways
    const headerBox = (await homeHeading().locator('..').boundingBox())!
    const bodyBox = (await homeBody().boundingBox())!
    const footerBox = (await homeCancel().locator('..').boundingBox())!
    expect(bodyBox.height).toBeGreaterThan(0)
    expect(headerBox.y + headerBox.height).toBeLessThanOrEqual(bodyBox.y + 1)
    expect(bodyBox.y + bodyBox.height).toBeLessThanOrEqual(footerBox.y + 1)
    expect(await homeBody().evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)

    await expectReachable(dialog().getByText(/GitHub CLI.*not found/))
    await expectReachable(repoRows().last())
    const clone = dialog().getByRole('button', { name: 'Clone' })
    await expectReachable(clone)
    await clone.click()
    await expect(dialog().locator('h2:has-text("Clone Repository")')).toBeVisible()
  })

  type SubView = {
    heading: string
    /** Navigate from Home to the view (clicks in earlier screens only). */
    open: () => Promise<void>
    /** Interactions inside the view itself, run after its heading is checked (they may scroll the dialog). */
    prepare?: () => Promise<void>
    /** Controls inside the view body that must be reachable once it has loaded (never just Back/Cancel). */
    targets: () => Locator[]
    /** Also require every visible form control in the view (inputs, checkboxes, selects, textareas) to be reachable. */
    formFields?: boolean
  }

  const ADD_REPO_FOLDER = '/tmp/broomy-e2e-add-repo'
  const subViews: SubView[] = [
    {
      heading: 'New Branch',
      open: () => dialog().locator('button[title="Create a new branch worktree"]').click(),
      targets: () => [dialog().locator('input[placeholder="feature/my-feature"]'), dialog().getByRole('button', { name: 'Create Branch' })],
    },
    {
      heading: 'Existing Branches',
      open: () => dialog().locator('button[title="Open an existing branch"]').click(),
      targets: () => {
        const branches = dialog().locator('.max-h-80 > button')
        return [dialog().locator('input[placeholder="Search branches..."]'), branches.first(), branches.last()]
      },
    },
    {
      heading: 'Issues',
      open: () => dialog().locator('button[title="Browse GitHub issues"]').click(),
      targets: () => [dialog().locator('input[placeholder="Search issues..."]'), dialog().locator('[data-issue-row]').first(), dialog().locator('[data-issue-row]').last()],
    },
    {
      heading: 'PRs to Review',
      open: () => dialog().locator('button[title="Review pull requests"]').click(),
      targets: () => [dialog().getByRole('tablist'), dialog().locator('[data-pr-row]').first(), dialog().locator('[data-pr-row]').last()],
    },
    {
      heading: 'Select Agent',
      open: () => dialog().locator('button[title="Open main branch"]').click(),
      targets: () => [dialog().getByRole('button', { name: /Claude Code/ }), dialog().getByRole('button', { name: /Shell Only/ })],
    },
    {
      heading: 'Repository Settings',
      open: () => dialog().locator('button[title="Repository settings"]').click(),
      targets: () => [
        dialog().locator('textarea[placeholder^="#!/bin/bash"]'),
        dialog().locator('textarea[placeholder^="Focus on"]'),
        dialog().locator('select').first(),
        dialog().getByRole('button', { name: 'Save', exact: true }),
      ],
      formFields: true,
    },
    {
      heading: 'Clone Repository',
      open: () => dialog().getByRole('button', { name: 'Clone' }).click(),
      prepare: () => dialog().getByRole('button', { name: 'Init Script' }).click(),
      targets: () => [
        dialog().locator('input[placeholder^="https://github.com"]'),
        dialog().locator('textarea[placeholder^="#!/bin/bash"]'),
        dialog().getByRole('button', { name: 'Clone', exact: true }),
      ],
      formFields: true,
    },
    {
      heading: 'Add Existing Repository',
      open: async () => {
        await overrideOpenFolder(ADD_REPO_FOLDER)
        await dialog().getByRole('button', { name: 'Add Repo' }).click()
      },
      prepare: () => dialog().getByRole('button', { name: 'Browse' }).click(),
      targets: () => [
        dialog().locator('input[placeholder="Select folder with worktrees..."]'),
        dialog().locator('select').last(),
        dialog().getByRole('button', { name: 'Add Repository' }),
      ],
      formFields: true,
    },
    {
      heading: 'Select Agent',
      open: async () => {
        await overrideOpenFolder(ADD_REPO_FOLDER)
        await dialog().getByRole('button', { name: 'Folder' }).click()
      },
      targets: () => [dialog().getByRole('button', { name: /Claude Code/ }), dialog().getByRole('button', { name: /Shell Only/ })],
    },
    {
      heading: 'Create Worktree',
      open: async () => {
        await dialog().locator('button[title="Open an existing branch"]').click()
        await dialog().getByRole('button', { name: /feature\/auth/ }).click()
      },
      targets: () => [dialog().locator('select').first(), dialog().getByRole('button', { name: 'Create Worktree' })],
    },
    {
      heading: 'Review PR',
      open: async () => {
        await dialog().locator('button[title="Review pull requests"]').click()
        await dialog().locator('[data-pr-row]').filter({ hasText: 'Add dark mode support' }).click()
      },
      targets: () => [dialog().locator('select').first(), dialog().getByRole('button', { name: 'Start Review' })],
    },
  ]

  async function expectEverySubViewReachable() {
    for (const view of subViews) {
      await test.step(view.heading, async () => {
        await openNewSessionDialog()
        await view.open()
        // A view must open at its top, inside the window
        const heading = dialog().locator(`h2:text-is("${view.heading}")`)
        await expect(heading).toBeVisible({ timeout: 5000 })
        await expectDialogInsideWindow()
        await expect(heading).toBeInViewport({ ratio: 1 })

        await view.prepare?.()
        const targets = view.targets()
        // Wait for loaded content (lists, settings) before measuring
        for (const target of targets) await expect(target).toHaveCount(1, { timeout: 5000 })
        await expectDialogInsideWindow()
        for (const target of targets) await expectReachable(target)
        if (view.formFields) {
          const fields = dialog().locator('input:visible, textarea:visible, select:visible')
          const count = await fields.count()
          expect(count).toBeGreaterThan(0)
          for (let i = 0; i < count; i++) await expectReachable(fields.nth(i))
        }
        await page.keyboard.press('Escape')
        await expect(homeHeading()).toBeVisible()
        await closeDialog()
      })
    }
  }

  test('every sub-view fits and its content stays reachable (#184)', async () => {
    await expectEverySubViewReachable()
  })

  test('every sub-view fits at 800x600 at 200% (#184)', async () => {
    await setWindow(800, 600, 2)
    await expectEverySubViewReachable()
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
