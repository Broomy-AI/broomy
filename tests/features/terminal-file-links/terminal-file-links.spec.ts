/**
 * Feature Documentation: ⌘/⌃-click a file path in the terminal to open it (#153)
 *
 * Modeled on iTerm2 Semantic History: an EXISTING file path printed in the terminal becomes a
 * link. ⌘-click (⌃-click on Linux) opens a document/media file in the OS default app
 * (e.g. HTML → browser) or reveals anything else in the file manager. Relative paths resolve
 * against the session's worktree dir. A plain click still positions the cursor.
 *
 * The open/reveal itself is not observable in E2E (`shell:openPath` no-ops, and `shell:pathExists`
 * returns false under E2E_TEST so nothing is linkified during the test), so the detection, existence
 * gating, and open/reveal decision are verified in the unit tests
 * (`terminalPathLinkProvider.test.ts`, `shell.test.ts`). This walkthrough documents the visible
 * state: a real file path rendered in the terminal.
 *
 * Run with: pnpm test:feature-docs terminal-file-links
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

/** The file path the fake agent prints (scripts/fake-claude.sh). */
const AGENT_PATH = '/tmp/broomy-preview.html'

/** Read serialized terminal buffer content from the in-app registry. */
async function getTerminalContent(p: Page): Promise<string> {
  return p.evaluate(() => {
    const registry = (window as unknown as {
      __terminalBufferRegistry?: { getSessionIds: () => string[]; getBuffer: (id: string) => string | null }
    }).__terminalBufferRegistry
    if (!registry) return ''
    for (const id of registry.getSessionIds()) {
      if (id.endsWith('-user')) continue
      const buf = registry.getBuffer(id)
      if (buf && buf.length > 0) return buf
    }
    return ''
  })
}

let page: Page
const steps: FeatureStep[] = []

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Click a File Path in the Terminal to Open It',
      description:
        'An existing file path printed in the terminal becomes a link — ⌘-click (⌃-click on ' +
        'Linux) opens documents/media in the default app or reveals other files in the ' +
        'file manager. Modeled on iTerm2 Semantic History.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Click a File Path in the Terminal', () => {
  test('A file path printed in the terminal is a ⌘/⌃-clickable link', async () => {
    await expect.poll(() => getTerminalContent(page), { timeout: 15000 }).toContain(AGENT_PATH)

    const agentPanel = page.locator('[data-panel-id="agent"]')
    await expect(agentPanel).toBeVisible()

    await screenshotElement(page, agentPanel, path.join(SCREENSHOTS, '01-path-in-terminal.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/01-path-in-terminal.png',
      caption: 'A file path printed in the terminal is clickable',
      description:
        'Agents constantly print file paths — a generated HTML design doc, a report, a source ' +
        'file. Existing paths (absolute, ~, or relative to the worktree) underline on hover. ' +
        '⌘-click (⌃-click on Linux) opens a document/media file in the OS default app ' +
        '(here the .html opens in the browser) and reveals anything else in the file manager; a ' +
        'plain click still positions the cursor. Only EXISTING files are linkified, so unrelated ' +
        'slash-separated text is left alone.',
    })
  })
})
