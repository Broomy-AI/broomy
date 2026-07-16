/**
 * Feature Documentation: Appearance (themes and text size)
 *
 * Broomy was dark-only, with every font size hardcoded to 13px. This adds a light
 * theme, two high-contrast themes, a customisable accent colour, a configurable
 * status-indicator (LED / spinner) colour, and three independent size controls.
 *
 * Run with: pnpm test:feature-docs appearance
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { generateFeaturePage, generateIndex, FeatureStep } from '../_shared/template'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FEATURE_DIR = __dirname
const SCREENSHOTS = path.join(FEATURE_DIR, 'screenshots')
const FEATURES_ROOT = path.join(__dirname, '..')

let page: Page
const steps: FeatureStep[] = []

/** Open the settings panel. Appearance is its first section. */
async function openSettings() {
  const settingsButton = page.locator('button[title^="Settings"]')
  await settingsButton.click()
  await page.waitForSelector('[data-panel-id="settings"]', { state: 'visible', timeout: 5000 })
}

const setTheme = async (value: string) => {
  await page.locator('#appearance-theme').selectOption(value)
  // The theme is applied by writing data-theme on <html>.
  await expect(page.locator('html')).toHaveAttribute('data-theme', value, { timeout: 5000 })
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Appearance — themes and text size',
      description:
        'Broomy was dark-only and every font size was hardcoded to 13px, which is a real barrier ' +
        'for low-vision users. Appearance adds a light theme, two high-contrast themes, a ' +
        'customisable accent colour, a configurable status-indicator colour, and three independent ' +
        'size controls. It is the first section ' +
        'in Settings on purpose: someone who cannot read the UI should not have to scroll past it ' +
        'to find the control that fixes that. Colours resolve through CSS custom properties, so a ' +
        'theme change repaints the whole app — including Monaco and the agent terminal — without ' +
        'restarting anything or killing a running agent.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Appearance', () => {
  test('Step 1: The Appearance section', async () => {
    await openSettings()

    const settings = page.locator('[data-panel-id="settings"]')
    await expect(settings.getByText('Appearance', { exact: true })).toBeVisible()
    await expect(page.locator('#appearance-theme')).toBeVisible()

    await page.screenshot({ path: path.join(SCREENSHOTS, '01-appearance-dark.png') })
    steps.push({
      screenshotPath: 'screenshots/01-appearance-dark.png',
      caption: 'Appearance settings (dark, the default)',
      description:
        'Appearance is the first section in Settings. It offers a theme, an accent colour with ' +
        'five presets plus a full colour picker, and three size controls. The default is Dark, ' +
        'unchanged from before — existing users see exactly what they saw yesterday until they ' +
        'change something here.',
    })
  })

  test('Step 2: Light theme', async () => {
    await setTheme('light')

    await page.screenshot({ path: path.join(SCREENSHOTS, '02-light.png') })
    steps.push({
      screenshotPath: 'screenshots/02-light.png',
      caption: 'Light theme',
      description:
        'The base is a warm off-white (#fbfbfa), deliberately not pure white: specular glare is ' +
        'itself a source of low-vision eye strain. The accent darkens too — the dark theme\'s ' +
        '#4a9eff is only 2.66:1 on this ground, which is a catastrophic failure, so it becomes a ' +
        'deeper blue at 7.4:1. Every colour pairing the UI can produce is asserted against WCAG ' +
        'AA in src/shared/theme.contrast.test.ts, rather than eyeballed.',
    })
  })

  test('Step 3: High contrast collapses the dimmed text tier', async () => {
    await setTheme('hc-light')

    await page.screenshot({ path: path.join(SCREENSHOTS, '03-high-contrast-light.png') })
    steps.push({
      screenshotPath: 'screenshots/03-high-contrast-light.png',
      caption: 'High contrast (light)',
      description:
        'High contrast is not "the same palette, but bolder". Its defining move is HIERARCHY ' +
        'COLLAPSE: text-secondary stops being a dimmer tier and resolves to text-primary. Around ' +
        '400 elements in this app are deliberately greyed below body text, and no amount of ' +
        'magnification makes grey legible — only removing the dimming does. Note that ' +
        'high-contrast DARK also exists, but white-on-black maximises halation, so for ' +
        'astigmatism this light variant is the one to reach for.',
    })
  })

  test('Step 4: Accent colour is fitted to the theme', async () => {
    await setTheme('light')

    // Magenta: bright enough that a raw pick would be unreadable on a light ground.
    await page.locator('button[aria-label="Magenta"]').click()

    const settings = page.locator('[data-panel-id="settings"]')
    await expect(settings.getByText(/:1/).first()).toBeVisible()

    await page.screenshot({ path: path.join(SCREENSHOTS, '04-accent.png') })
    steps.push({
      screenshotPath: 'screenshots/04-accent.png',
      caption: 'A custom accent, fitted per theme',
      description:
        'The chosen colour is a HUE, not a final value. #ff00ff is a fine accent on a dark ' +
        'ground and an unreadable one on a light one, so the pick would hand a light-mode user ' +
        'illegible buttons. Broomy moves only its OKLCH lightness until it clears the contrast ' +
        'target — hue and chroma hold, so a magenta stays a magenta — then picks the button label ' +
        '(white or black) by whichever actually wins. The panel reports what it became and why, ' +
        'so a corrected colour is a feature rather than a surprise.',
    })
  })

  test('Step 5: Status indicator colour — decoupled from text contrast', async () => {
    // Still on light from the accent step. Match the status colour to the accent so the
    // LED and spinner follow it instead of the default green.
    await page.locator('button[aria-label="Match accent"]').click()
    await expect(page.locator('button[aria-label="Match accent"]')).toHaveAttribute('aria-pressed', 'true')

    await page.screenshot({ path: path.join(SCREENSHOTS, '05-status-colour.png') })
    steps.push({
      screenshotPath: 'screenshots/05-status-colour.png',
      caption: 'The status LED and spinner colour, held to the non-text contrast bar',
      description:
        'The sidebar\'s unread "check me" dot and the "Working" spinner are NON-TEXT indicators. ' +
        'WCAG governs them at 3:1 (1.4.11), not the 4.5:1 body-text bar (1.4.3) — and tuning a 12px ' +
        'dot to 4.5:1 is exactly what made the old green come out dark forest-green on a light ' +
        'ground. They now ride a dedicated status-accent token fitted to the non-text floor, so the ' +
        'green stays a vivid emerald. This control keeps that green, matches the theme accent ' +
        '(shown here), or takes any custom colour — each fitted per theme against the worst-case ' +
        'sidebar surface so the dot never washes out. The live dot-and-spinner preview renders the ' +
        'exact colour the sidebar will show.',
    })
  })

  test('Step 6: App text size — the control that reaches the agent transcript', async () => {
    const increase = page.locator('button[aria-label="Increase App text size"]')
    await increase.click()
    await increase.click()

    await expect(page.locator('#app-text-size')).toContainText('125%')

    await page.screenshot({ path: path.join(SCREENSHOTS, '06-app-text-size.png') })
    steps.push({
      screenshotPath: 'screenshots/06-app-text-size.png',
      caption: 'App text size at 125%',
      description:
        'Three size controls, because one is not enough. **App text size** scales every font ' +
        'token — the agent transcript, session list, explorer and all chrome — at no cost in ' +
        'screen space. It is the one to reach for first. Broomy\'s agent transcript is React, not ' +
        'xterm, so an "editor & terminal font size" cannot touch it; without this control the only ' +
        'way to enlarge the surface you read all day was to zoom the whole window and surrender a ' +
        'third of the screen. **Interface scale** does that whole-window zoom when you want it (and ' +
        'now survives a restart — Cmd +/- writes through to it). **Editor & terminal font size** ' +
        'enlarges code and agent output without inflating the chrome around them.',
    })
  })

  test('Step 7: Back to dark, and everything persists', async () => {
    await setTheme('dark')

    await page.screenshot({ path: path.join(SCREENSHOTS, '07-back-to-dark.png') })
    steps.push({
      screenshotPath: 'screenshots/07-back-to-dark.png',
      caption: 'Back to dark — the accent and text size survive the theme change',
      description:
        'Appearance is stored globally in ~/.broomy/settings.json rather than per-profile: ' +
        'nativeTheme.themeSource is process-global, so two profile windows disagreeing would leave ' +
        'the native chrome able to satisfy only one of them — and how readable a UI is, is a ' +
        'property of a person\'s eyes, not of which project they happen to have open. The main ' +
        'process reads it synchronously before the first window exists, so a light-mode user never ' +
        'sees a dark frame flash on launch.',
    })
  })
})
