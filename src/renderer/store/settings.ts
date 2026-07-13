/**
 * Appearance store.
 *
 * Seeded SYNCHRONOUSLY from the preload snapshot, so the first React render already
 * has the right theme — no async flip, no flash.
 */
import { create } from 'zustand'
import {
  DEFAULT_APPEARANCE,
  resolveTheme,
  type Appearance,
  type AppearanceSnapshot,
} from '../../shared/appearance'
import type { ThemeName } from '../../shared/theme'
import { useErrorStore } from './errors'

interface SettingsState {
  appearance: Appearance
  systemIsDark: boolean
  resolvedTheme: ThemeName
  set: (patch: Partial<Appearance>) => void
  /** Apply a snapshot pushed from main WITHOUT scheduling a save back. */
  applyRemote: (snapshot: AppearanceSnapshot) => void
  reset: () => void
}

const initial: AppearanceSnapshot =
  typeof window !== 'undefined' && window.settings?.getInitial
    ? window.settings.getInitial()
    : { appearance: DEFAULT_APPEARANCE, systemIsDark: true, resolvedTheme: 'dark' }

// A theme change is a discrete choice, not typing — there is nothing to coalesce,
// and main is the single writer. A short debounce only exists to absorb someone
// holding down the font-size stepper.
let saveTimer: ReturnType<typeof setTimeout> | null = null

function cancelPendingSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
}

function scheduleSave(appearance: Appearance): void {
  cancelPendingSave()
  saveTimer = setTimeout(() => {
    saveTimer = null
    void window.settings.save(appearance).then((result) => {
      // The per-profile config path ignores { success: false } and leaves the UI
      // looking saved until the next restart. Don't repeat that here.
      if (!result.success) {
        const message = result.error ?? 'Unknown error writing ~/.broomy/settings.json'
        useErrorStore.getState().showErrorDetail({
          id: `settings-save-${Date.now()}`,
          message,
          displayMessage: 'Could not save appearance settings',
          detail: message,
          scope: 'app',
          dismissed: false,
          timestamp: Date.now(),
        })
      }
    })
  }, 200)
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  appearance: initial.appearance,
  systemIsDark: initial.systemIsDark,
  resolvedTheme: initial.resolvedTheme,

  set: (patch) => {
    const appearance = { ...get().appearance, ...patch }
    set({
      appearance,
      resolvedTheme: resolveTheme(appearance.theme, get().systemIsDark),
    })
    scheduleSave(appearance)
  },

  applyRemote: (snapshot) => {
    // Cancel any save this window had queued. Otherwise a stale local value, typed
    // moments ago, lands on disk AFTER the update we just received from the other
    // window — and the two windows fight.
    cancelPendingSave()
    set({
      appearance: snapshot.appearance,
      systemIsDark: snapshot.systemIsDark,
      resolvedTheme: snapshot.resolvedTheme,
    })
  },

  reset: () => get().set(DEFAULT_APPEARANCE),
}))
