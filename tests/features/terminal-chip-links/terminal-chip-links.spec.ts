/**
 * Feature Documentation: Claude Code's `[file]`/`[image]` chips are clickable (#164)
 *
 * Claude Code prints file "chips" — `[file]/abs/path (2.7KB)`, `[image]…` — as OSC 8 hyperlinks,
 * the terminal escape sequence that attaches a link to the CELLS rather than to matched text. Broomy
 * asks for them with `FORCE_HYPERLINK=1` on the agent PTY and honors the `file://` URIs they carry:
 * ⌘-click (⌃-click on Windows/Linux) opens the file through the same gated `shell:openPath` used by
 * bare-path links (#153) — existence-checked, never following a symlink, documents/media in the OS
 * default app and everything else revealed in the file manager. Because the link rides on the cells,
 * it survives the hard wrap that chip paths almost always hit, which text matching could not.
 *
 * The hover hint is where the trust boundary shows. An OSC 8 label is arbitrary agent output and
 * need not match its URI, so the hint spells the real target out whenever the row under the pointer
 * doesn't already show it — a truthful chip stays quiet, a deceptive one is exposed before the click.
 *
 * This walkthrough drives REAL OSC 8 sequences through a real xterm by printf-ing them into the
 * terminal, which is byte-for-byte what Claude emits (`pathToFileURL` + `supports-hyperlinks`). The
 * open itself is not observable in E2E (`shell:openPath` no-ops under E2E_TEST), so the URI
 * validation, the isolated-session refusal, and the open/reveal decision are proven in the unit
 * tests (`terminalLinkHandler.test.ts`, `terminalOscLink.integration.test.ts`, `shell.test.ts`).
 * What is visible here — the link, the hint, and the anti-spoofing — is what this documents.
 *
 * Run with: pnpm test:feature-docs terminal-chip-links
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page, Locator } from '@playwright/test'
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

/** The file the chips point at — written by scripts/fake-claude.sh, so it really exists. */
const TARGET = '/tmp/broomy-preview.html'
/** An honest chip: the label names the file the URI points at. */
const HONEST_LABEL = `[file]${TARGET} (1.2KB)`
/** A deceptive chip: the label names an image, the URI points at the HTML file above. */
const SPOOF_LABEL = '[image]/tmp/holiday-photo.png (495.3KB)'

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

/**
 * Hover the chip a few characters in from the start of its row.
 *
 * xterm rows span the full width, so hovering the row's centre would land past the text; a small
 * fixed offset lands inside the `[file]`/`[image]` tag at any font size we ship. The hint is driven
 * by xterm's own link layer, so this has to be a real pointer position over the linked cells — a
 * synthetic hover on the element would not do.
 */
async function hoverChip(p: Page, panel: Locator, label: string): Promise<void> {
  const row = panel.locator('.xterm-rows > div').filter({ hasText: label }).first()
  await expect(row).toBeVisible()
  const box = await row.boundingBox()
  if (!box) throw new Error(`No bounding box for the chip row: ${label}`)
  await p.mouse.move(box.x + 20, box.y + box.height / 2)
}

/** The hint element the terminal mounts for the hovered link. */
const hintOf = (panel: Locator): Locator =>
  panel.locator('.xterm-hover').filter({ hasText: 'click to open' })

let page: Page
const steps: FeatureStep[] = []

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: "Claude's [file] and [image] Chips Are Clickable",
      description:
        'Claude Code prints file chips as OSC 8 hyperlinks, so the link lives on the terminal ' +
        'cells and survives the hard wrap a long path always hits. ⌘-click (⌃-click on ' +
        'Windows/Linux) opens the file; hovering names the real target whenever the chip’s own ' +
        'label does not already show it.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Clickable Claude Code file chips', () => {
  test('A chip printed as an OSC 8 hyperlink renders in the terminal', async () => {
    // The fake agent prints both chips as real OSC 8 sequences (scripts/fake-claude.sh).
    await expect.poll(() => getTerminalContent(page), { timeout: 20000 }).toContain(HONEST_LABEL)

    const agentPanel = page.locator('[data-panel-id="agent"]')
    await expect(agentPanel).toBeVisible()

    await screenshotElement(page, agentPanel, path.join(SCREENSHOTS, '01-chip-in-terminal.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/01-chip-in-terminal.png',
      caption: 'A file chip in the agent terminal',
      description:
        'When Claude reads or writes a file it prints a chip like `[file]/tmp/broomy-preview.html ' +
        '(1.2KB)`. It looks like plain text, but Claude emits it as an OSC 8 hyperlink carrying a ' +
        '`file://` URI, and Broomy asks for that explicitly by setting FORCE_HYPERLINK=1 on the ' +
        'agent PTY — without it Claude cannot tell that this terminal supports hyperlinks and ' +
        'falls back to plain text. The link is attached to the cells rather than to matched text, ' +
        'which is why it still works when a long path hard-wraps across two rows: both rows carry ' +
        'the same link. That wrap is the normal case for real chip paths, and it is what defeated ' +
        'matching the rendered text.',
    })
  })

  test('Hovering shows the ⌘click affordance without repeating what the row already says', async () => {
    const agentPanel = page.locator('[data-panel-id="agent"]')
    await hoverChip(page, agentPanel, HONEST_LABEL)

    const hint = hintOf(agentPanel)
    await expect(hint).toBeVisible()
    // The row already spells out /tmp/broomy-preview.html, so the hint adds nothing to it.
    await expect(hint).not.toContainText(TARGET)

    await screenshotElement(page, agentPanel, path.join(SCREENSHOTS, '02-hover-hint.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/02-hover-hint.png',
      caption: 'Hovering underlines the chip and explains the gesture',
      description:
        'xterm underlines a link and shows a pointer cursor whether or not the modifier is held, ' +
        'so without a hint a plain click would be a dead end with no explanation — a plain click ' +
        'still just positions the cursor. The hint names the platform modifier: ⌘-click on macOS, ' +
        '⌃-click on Windows and Linux, primary button only, because ⌃-click on macOS is the ' +
        'context-menu gesture. Here the chip is honest — the path in the hint would be the path ' +
        'already on the row — so the hint stays short rather than repeating the terminal.',
    })
  })

  test('A chip whose label disagrees with its link has the real target spelled out', async () => {
    const agentPanel = page.locator('[data-panel-id="agent"]')

    // Same URI as the honest chip, under a label claiming to be an image somewhere else entirely.
    await hoverChip(page, agentPanel, SPOOF_LABEL)

    const hint = hintOf(agentPanel)
    await expect(hint).toBeVisible()
    await expect(hint).toContainText(TARGET) // the target the label was hiding

    await screenshotElement(page, agentPanel, path.join(SCREENSHOTS, '03-spoofed-chip.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/03-spoofed-chip.png',
      caption: 'A deceptive label cannot hide where the click goes',
      description:
        'Terminal output is untrusted: an agent, or any command it runs, can print whatever it ' +
        'likes, and an OSC 8 label need not match its URI. This chip reads ' +
        '`[image]/tmp/holiday-photo.png` while its link points at /tmp/broomy-preview.html. ' +
        'Because the row under the pointer does not contain the real target, the hint spells it ' +
        'out before you ⌘-click — the same check covers https links, where a label could name one ' +
        'site and the URI another. The path is rendered as text, never as markup, and shortened ' +
        'from the middle so the filename survives. Opening then goes through the same gated opener ' +
        'bare-path links use, and is refused outright for isolated/devcontainer sessions, whose ' +
        'container paths must never resolve against the host filesystem.',
    })
  })
})
