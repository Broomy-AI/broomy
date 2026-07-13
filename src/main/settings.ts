/**
 * Owns ~/.broomy/settings.json — the global appearance preferences.
 *
 * Loaded SYNCHRONOUSLY at startup, before the first BrowserWindow exists, because
 * `backgroundColor` and `titleBarOverlay` are constructor options: a light-mode
 * user must not get a dark window frame flashed at them on every launch.
 *
 * Deliberately has NO field whitelist. The per-profile `config:save` handler copies
 * an explicit list of keys and silently drops the rest, which is why
 * `tutorialProgress` has never persisted despite being declared, sent and read
 * back. Here the whole object round-trips.
 */
import { readFileSync, writeFileSync, renameSync, copyFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { CONFIG_DIR } from './handlers/types'
import {
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  resolveTheme,
  type Appearance,
  type AppearanceSnapshot,
} from '../shared/appearance'
import { hexFromTriplet, PALETTE, type ThemeName } from '../shared/theme'
import { deriveAccent } from '../shared/appearance'

/**
 * Mirrors getConfigFileName(isDev). Without this split, running `pnpm dev` would
 * write the developer's real appearance settings — and the promise that dev is
 * isolated from a user's live sessions would be false.
 */
export function getSettingsFileName(isDev: boolean): string {
  return isDev ? 'settings.dev.json' : 'settings.json'
}

export const getSettingsFile = (isDev: boolean): string => join(CONFIG_DIR, getSettingsFileName(isDev))

interface State {
  appearance: Appearance
  systemIsDark: boolean
  isDev: boolean
  isE2ETest: boolean
}

const state: State = {
  appearance: { ...DEFAULT_APPEARANCE },
  systemIsDark: true,
  isDev: false,
  isE2ETest: false,
}

/**
 * Read settings from disk. Must never throw: a corrupt or hand-edited file has to
 * degrade to defaults, not take down the app before it has a window to report the
 * error in.
 */
export function initSettings(isDev: boolean, isE2ETest: boolean, systemIsDark: boolean): Appearance {
  state.isDev = isDev
  state.isE2ETest = isE2ETest
  state.systemIsDark = systemIsDark

  // E2E short-circuits HERE rather than in the IPC handler, because the things that
  // shape a screenshot — the zoom factor, the window background, nativeTheme — are
  // applied in main and never pass through the handler. Without this, a developer
  // running the suite with interfaceScale 1.5 would regenerate every reference
  // screenshot and ship zoomed marketing images.
  if (isE2ETest) {
    state.appearance = { ...DEFAULT_APPEARANCE }
    return state.appearance
  }

  const file = getSettingsFile(isDev)
  if (!existsSync(file)) {
    state.appearance = { ...DEFAULT_APPEARANCE }
    return state.appearance
  }

  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf-8'))
    const parsed = raw as { appearance?: unknown }
    state.appearance = normalizeAppearance(parsed.appearance ?? raw)
  } catch (error) {
    // Recoverable, but worth surfacing: a settings file that silently reverts is
    // maddening to debug. (src/test/console-guard.ts allows an expected warning.)
    console.warn(`[settings] Could not read ${file}, using defaults:`, String(error))
    state.appearance = { ...DEFAULT_APPEARANCE }
  }
  return state.appearance
}

export const getAppearance = (): Appearance => state.appearance
export const getSystemIsDark = (): boolean => state.systemIsDark

export function setSystemIsDark(isDark: boolean): void {
  state.systemIsDark = isDark
}

export const getResolvedTheme = (): ThemeName => resolveTheme(state.appearance.theme, state.systemIsDark)

export function snapshot(): AppearanceSnapshot {
  return {
    appearance: state.appearance,
    systemIsDark: state.systemIsDark,
    resolvedTheme: getResolvedTheme(),
  }
}

/** Atomic write: tmp -> backup -> rename, matching the config handler. */
export function saveAppearance(next: unknown): { success: boolean; error?: string } {
  state.appearance = normalizeAppearance(next)

  // Never touch disk under test — but DO keep the in-memory value, so an E2E spec
  // can still flip the theme and screenshot it.
  if (state.isE2ETest) return { success: true }

  const file = getSettingsFile(state.isDev)
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify({ appearance: state.appearance }, null, 2))
    if (existsSync(file)) copyFileSync(file, `${file}.backup`)
    renameSync(tmp, file)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

/**
 * The colours the NATIVE chrome needs, as real hex. Native geometry and colour live
 * outside the DOM, so they cannot read a CSS variable — they have to be pushed.
 */
export function chromeFor(theme: ThemeName, accentHex: string) {
  return {
    background: hexFromTriplet(PALETTE[theme]['bg-primary']),
    titleBar: hexFromTriplet(PALETTE[theme]['bg-secondary']),
    symbol: hexFromTriplet(PALETTE[theme]['text-primary']),
    accent: hexFromTriplet(deriveAccent(accentHex, theme).accentTriplet),
  }
}
