/**
 * Applies the appearance settings to the document, and keeps this window in step
 * with the others.
 *
 * The interface scale is NOT applied here — it is a webContents zoom factor, owned
 * by main. Only the theme and the text scale are the DOM's business.
 */
import { useEffect } from 'react'
import { useSettingsStore } from '../../store/settings'
import { deriveAccent, resolveStatusColorVar } from '../../../shared/appearance'

/** Set the theme, accent and text scale on <html>. Safe to call before React mounts. */
export function applyAppearanceToDocument(): void {
  const { appearance, resolvedTheme } = useSettingsStore.getState()
  const root = document.documentElement

  root.dataset.theme = resolvedTheme
  root.style.setProperty('--app-text-scale', String(appearance.appTextScale))

  // The accent is a user-chosen HUE, fitted to the active theme. Inline custom
  // properties win over the theme block's, so this overrides `--color-accent`
  // without the theme having to know anything about it.
  const { accentTriplet, onAccentTriplet } = deriveAccent(appearance.accent, resolvedTheme)
  root.style.setProperty('--color-accent', accentTriplet)
  root.style.setProperty('--color-on-accent', onAccentTriplet)

  // The focus ring follows the accent — except in high contrast, where the theme
  // pins it to a fixed maximum-visibility colour and must not be overridden.
  if (resolvedTheme === 'hc' || resolvedTheme === 'hc-light') {
    root.style.removeProperty('--color-focus-ring')
  } else {
    root.style.setProperty('--color-focus-ring', accentTriplet)
  }

  // The status indicators (unread "check me" dot, working spinner) ride the same seam.
  // 'default' returns null → clear the inline var so the per-theme CSS token (the green)
  // wins; 'accent'/custom return a fitted triplet that overrides it.
  const statusTriplet = resolveStatusColorVar(appearance, resolvedTheme)
  if (statusTriplet) {
    root.style.setProperty('--color-status-accent', statusTriplet)
  } else {
    root.style.removeProperty('--color-status-accent')
  }
}

export function useAppearance(): void {
  const appearance = useSettingsStore((s) => s.appearance)
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme)

  useEffect(() => {
    applyAppearanceToDocument()
  }, [appearance, resolvedTheme])

  // Another profile window changed the theme, or the OS appearance flipped under a
  // `system` preference. Both arrive the same way.
  useEffect(() =>
    window.settings.onChanged((snapshot) => {
      useSettingsStore.getState().applyRemote(snapshot)
    }),
  [])
}
