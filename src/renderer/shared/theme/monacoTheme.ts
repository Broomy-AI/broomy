/**
 * Monaco themes.
 *
 * `defineTheme` MUST run at module scope, before any editor mounts: calling
 * `setTheme` with a name Monaco has not seen falls back silently to the built-in
 * light `vs` — no throw, no warning, just a white editor in a dark app. Importing
 * this module from both viewers is what guarantees the ordering.
 *
 * The `theme` prop is applied through `monaco.editor.setTheme()`, which is GLOBAL
 * across every editor instance. MonacoViewer and MonacoDiffViewer therefore cannot
 * disagree — both read one value from the store, and neither takes it as a prop.
 *
 * `autoDetectHighContrast` is deliberately NOT disabled. Monaco watches
 * `forced-colors: active` (Windows High Contrast) and swaps to its hc themes;
 * suppressing that would strip a real accessibility affordance from exactly the
 * users this work is for.
 */
import * as monaco from 'monaco-editor'
import type { ThemeName } from '../../../shared/theme'

// base 'vs-dark' with inherit and no overrides is vs-dark exactly, so dark is unchanged.
monaco.editor.defineTheme('broomy-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {},
})

monaco.editor.defineTheme('broomy-light', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#fbfbfa',
    'editor.foreground': '#1f2328',
    'editorGutter.background': '#fbfbfa',
    'editorLineNumber.foreground': '#8c959f',
    'editorLineNumber.activeForeground': '#1f2328',
    'editor.lineHighlightBackground': '#f0f0ee',
    'editor.selectionBackground': '#0a5ec926',
    'editorCursor.foreground': '#1f2328',
    'editorWidget.background': '#ffffff',
    'editorWidget.border': '#c2c2bb',
    'scrollbarSlider.background': '#8c959f40',
    'diffEditor.insertedTextBackground': '#1a7a3520',
    'diffEditor.removedTextBackground': '#c02a3020',
  },
})

monaco.editor.defineTheme('broomy-hc', {
  base: 'hc-black',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#000000',
    'editor.foreground': '#ffffff',
    'editorGutter.background': '#000000',
    'editorLineNumber.foreground': '#b0b0b0',
    'editorLineNumber.activeForeground': '#ffff00',
    'editorCursor.foreground': '#ffff00',
  },
})

monaco.editor.defineTheme('broomy-hc-light', {
  base: 'hc-light',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#000000',
    'editorGutter.background': '#ffffff',
    'editorLineNumber.foreground': '#3d3d3d',
    'editorLineNumber.activeForeground': '#000000',
    'editorCursor.foreground': '#000000',
  },
})

/** Theme ids must match /^[a-z0-9-]+$/ and reference a builtin base. */
export const MONACO_THEMES: Record<ThemeName, string> = {
  dark: 'broomy-dark',
  light: 'broomy-light',
  hc: 'broomy-hc',
  'hc-light': 'broomy-hc-light',
}
