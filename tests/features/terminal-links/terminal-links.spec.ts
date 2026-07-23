/**
 * Feature Documentation: ⌘/⌃-click a URL in the terminal to open it (#149)
 *
 * URLs printed in the terminal (PR links, docs, localhost dev servers) become
 * clickable via `@xterm/addon-web-links`: ⌘-click (⌃-click on Windows/Linux) opens
 * them in the default browser through `window.shell.openExternal`. A plain click still
 * positions the cursor, and only http(s) URLs are opened.
 *
 * Hovering shows a "⌘click to open" hint, because xterm underlines a link whether or not
 * the modifier is held.
 *
 * The browser-open itself is not observable in E2E (`shell:openExternal` no-ops under
 * E2E_TEST), so the interaction logic — modifier gating, primary-button-only, http(s)
 * scheme filtering — is verified in the unit tests
 * (`src/renderer/panels/agent/hooks/terminalLinkHandler.test.ts`, `terminalLinkHint.test.ts`).
 * This walkthrough documents the visible state: a real URL rendered in the terminal.
 *
 * Run with: pnpm test:feature-docs terminal-links
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

/** The URL the fake agent prints (scripts/fake-claude.sh). */
const AGENT_URL = 'https://github.com/Broomy-AI/broomy/pull/149'

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
      title: 'Click a URL in the Terminal to Open It',
      description:
        '⌘-click (⌃-click on Windows/Linux) a URL printed in the terminal to open it in the ' +
        'default browser. A plain click still positions the cursor, and only http(s) URLs open.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Click a URL in the Terminal', () => {
  test('A URL printed in the terminal is a ⌘/⌃-clickable link', async () => {
    // Wait for the fake agent to finish so its URL line is in the terminal buffer.
    await expect.poll(() => getTerminalContent(page), { timeout: 15000 }).toContain(AGENT_URL)

    const agentPanel = page.locator('[data-panel-id="agent"]')
    await expect(agentPanel).toBeVisible()

    await screenshotElement(page, agentPanel, path.join(SCREENSHOTS, '01-url-in-terminal.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/01-url-in-terminal.png',
      caption: 'A URL printed in the terminal is clickable',
      description:
        'Agents constantly print URLs — PR links from `gh pr create`, docs, localhost dev ' +
        'servers. The web-links addon detects the URL (and xterm handles OSC 8 hyperlinks) and ' +
        'underlines it on hover, alongside a "⌘click to open" hint — xterm underlines a link ' +
        'whether or not the modifier is held, so without the hint a plain click would be a dead ' +
        'end with no explanation. ⌘-click (⌃-click on Windows/Linux) opens it via ' +
        'window.shell.openExternal — the same external-browser path the rest of the app uses, so ' +
        'the Electron window never navigates away. A plain click still positions the cursor, and ' +
        'only http(s) URLs open (file:, javascript:, mailto: and scheme-less text are ignored). ' +
        'The open itself is not observable in E2E, so the modifier/button/scheme gating is ' +
        'proven in terminalLinkHandler.test.ts.',
    })
  })
})
