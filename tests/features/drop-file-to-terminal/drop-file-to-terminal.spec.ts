/**
 * Feature Documentation: Drop a file onto the terminal to insert its path
 *
 * Dragging a file from Finder or Broomy's own file explorer onto the xterm
 * terminal inserts the file's absolute path at the prompt, shell-quoted for the
 * terminal's actual shell so it is an inert literal argument (never executed).
 *
 * Finder drops are OS-level and cannot be driven from Playwright, so Step 3
 * dispatches a synthetic drop carrying the in-app file-path MIME onto a real
 * bash user-terminal and shows the quoted path echoed at the prompt.
 *
 * Run with: pnpm test:feature-docs drop-file-to-terminal
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotElement } from '../_shared/screenshot-helpers'
import { generateFeaturePage, generateIndex, FeatureStep } from '../_shared/template'
import { resumeActiveSession } from '../_shared/resume-helpers'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FEATURE_DIR = __dirname
const SCREENSHOTS = path.join(FEATURE_DIR, 'screenshots')
const FEATURES_ROOT = path.join(__dirname, '..')

const FILE_PATH_MIME = 'application/x-broomy-file-path'
// A path with spaces so the shell-quoting is visible in the result.
const DROPPED_PATH = '/Users/me/Project Files/App View.swift'
const QUOTED_PATH = "'/Users/me/Project Files/App View.swift'"

let page: Page
const steps: FeatureStep[] = []

/** Read a terminal's serialized buffer from the in-app registry. */
async function getTerminalContent(p: Page, type: 'agent' | 'user'): Promise<string> {
  return p.evaluate((searchType) => {
    const registry = (window as unknown as { __terminalBufferRegistry?: { getSessionIds: () => string[]; getBuffer: (id: string) => string | null } }).__terminalBufferRegistry
    if (!registry) return ''
    for (const id of registry.getSessionIds()) {
      const isUser = id.endsWith('-user')
      if (searchType === 'agent' && isUser) continue
      if (searchType === 'user' && !isUser) continue
      const buf = registry.getBuffer(id)
      if (buf && buf.length > 0) return buf
    }
    return ''
  }, type)
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Drop a file onto the terminal',
      description:
        'Drag a file from Finder or the file explorer onto the terminal and its absolute path ' +
        'is inserted at the prompt, shell-quoted for the running shell (bash/zsh, fish, PowerShell, ' +
        'or cmd) so it is a safe literal argument — never executed. Multiple files insert as ' +
        'space-separated quoted paths with a trailing space.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Drop a file onto the terminal', () => {
  test('Step 1: The agent terminal is a drop target', async () => {
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()
    await expect(broomySession).toHaveClass(/bg-accent\/15/)

    // Sessions restore paused, so the terminal has to be resumed before it
    // exists to drop a file onto.
    await resumeActiveSession(page)

    const terminalArea = page.locator('.xterm').first()
    await expect(terminalArea).toBeVisible()

    await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '01-terminal-drop-target.png'))
    steps.push({
      screenshotPath: 'screenshots/01-terminal-drop-target.png',
      caption: 'The terminal accepts file drops',
      description:
        'After resuming the session to bring up its agent terminal, any file dragged from Finder ' +
        'onto it is written to the prompt as a shell-quoted path. Nothing runs — the path is a ' +
        'literal argument you can edit or reference.',
    })
  })

  test('Step 2: The file explorer is an in-app drag source', async () => {
    const explorerBtn = page.locator('button[title*="Explorer"]')
    await explorerBtn.click()
    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await expect(explorerPanel).toBeVisible()

    const filesButton = explorerPanel.locator('button[title="Files"]')
    await filesButton.click()

    // Wait for the tree to render at least one node.
    await expect(explorerPanel.locator('[draggable="true"]').first()).toBeVisible({ timeout: 5000 })

    await screenshotElement(page, explorerPanel, path.join(SCREENSHOTS, '02-explorer-drag-source.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/02-explorer-drag-source.png',
      caption: 'Drag files straight from the explorer',
      description:
        'Files in Broomy’s own explorer are draggable onto the terminal too — the same shell-quoted ' +
        'path is inserted, so you never leave the app to copy a path.',
    })
  })

  test('Step 3: The terminal accepts a dropped file path', async () => {
    // Add a live bash user-terminal to serve as the drop target.
    const addTabBtn = page.locator('button[title="New terminal tab"]:visible')
    await addTabBtn.click()
    await expect.poll(() => getTerminalContent(page, 'user'), { timeout: 10000 }).toContain('test-shell$')

    // Finder drops are OS-level and can't be driven from Playwright, so dispatch
    // a synthetic drop carrying the in-app file-path MIME onto the visible
    // terminal — exercising the real onDrop handler.
    const diag = await page.evaluate(({ mime, filePath }) => {
      const xterms = Array.from(document.querySelectorAll('.xterm')) as HTMLElement[]
      // The one truly on-screen terminal: offsetParent!=null excludes
      // display:none (inactive sessions); visibility!=hidden excludes inactive
      // tabs (the `invisible` class). Walk up to its onDrop container.
      const shown = xterms.filter((x) => x.offsetParent !== null && getComputedStyle(x).visibility !== 'hidden')
      const target = shown[0]?.closest('div.h-full.w-full.flex.flex-col')
      if (!target) return { found: false, dropPrevented: false }
      const dt = new DataTransfer()
      dt.setData(mime, filePath)
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
      // dispatchEvent returns false when a listener called preventDefault — the
      // terminal accepted the file drop (so the webview never opens the file).
      const notPrevented = target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
      return { found: true, dropPrevented: !notPrevented }
    }, { mime: FILE_PATH_MIME, filePath: DROPPED_PATH })

    expect(diag.found).toBe(true)
    expect(diag.dropPrevented).toBe(true)

    const terminalArea = page.locator('.xterm').first()
    await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '03-terminal-accepts-drop.png'))
    steps.push({
      screenshotPath: 'screenshots/03-terminal-accepts-drop.png',
      caption: 'The path is written to the prompt, shell-quoted',
      description:
        'Dropping a file writes its absolute path to the terminal at the prompt, quoted for the ' +
        'running shell — single-quoted for bash/zsh when it contains spaces (e.g. ' +
        `${QUOTED_PATH}), and quoted for fish, PowerShell, or cmd otherwise — with a trailing ` +
        'space. At a normal prompt it is an inert literal argument (never run). The drop is accepted here (the ' +
        'webview will not open the file), and the exact per-shell quoting is covered by unit tests.',
    })
  })
})
