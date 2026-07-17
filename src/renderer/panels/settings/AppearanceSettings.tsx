/**
 * Appearance settings — theme, accent, and the three size controls.
 *
 * Placed FIRST in Settings on purpose: it is the accessibility panel, and a user
 * who cannot read the UI should not have to scroll through it to find the control
 * that fixes that.
 *
 * The size controls are steppers, not dropdowns. A size is chosen in a
 * tweak-and-look loop — press, look, press again — and a <select> forces
 * open/scan/click/close each time while its popup covers the very content being
 * judged. Theme stays a <select>: three named options, no preview loop, and it gets
 * keyboard navigation and VoiceOver labelling for free.
 */
import { useMemo } from 'react'
import {
  ACCENT_PRESETS,
  APP_TEXT_SCALES,
  EDITOR_FONT_SIZES,
  INTERFACE_SCALES,
  TERMINAL_CONTRASTS,
  TERMINAL_LINE_HEIGHTS,
  deriveAccent,
  resolveTerminalContrast,
  type Appearance,
  type ThemePreference,
} from '../../../shared/appearance'
import { THEMES, type ThemeName } from '../../../shared/theme'
import { rgbToHex } from '../../../shared/color'

interface AppearanceSettingsProps {
  appearance: Appearance
  resolvedTheme: ThemeName
  onChange: (patch: Partial<Appearance>) => void
  onReset: () => void
}

const pct = (n: number) => `${Math.round(n * 100)}%`

export function AppearanceSettings({
  appearance,
  resolvedTheme,
  onChange,
  onReset,
}: AppearanceSettingsProps) {
  const accent = useMemo(
    () => deriveAccent(appearance.accent, resolvedTheme),
    [appearance.accent, resolvedTheme]
  )
  const fittedHex = rgbToHex(accent.accent)

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-text-primary">Appearance</h3>

      <div className="space-y-2">
        <label htmlFor="appearance-theme" className="text-xs text-text-secondary">Theme</label>
        <select
          id="appearance-theme"
          value={appearance.theme}
          onChange={(e) => onChange({ theme: e.target.value as ThemePreference })}
          className="w-full px-3 py-2 text-sm rounded border border-border bg-bg-primary text-text-primary"
        >
          <option value="system">System</option>
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <p className="text-xs text-text-tertiary">
          System follows your operating system appearance. High contrast removes the dimmed text
          tier rather than just deepening colours.
        </p>
      </div>

      <div className="space-y-2">
        <span className="text-xs text-text-secondary">Accent colour</span>
        <div className="flex items-center gap-2">
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.hex}
              type="button"
              onClick={() => onChange({ accent: preset.hex })}
              title={preset.name}
              aria-label={preset.name}
              aria-pressed={appearance.accent.toLowerCase() === preset.hex.toLowerCase()}
              className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                appearance.accent.toLowerCase() === preset.hex.toLowerCase()
                  ? 'border-text-primary'
                  : 'border-border'
              }`}
              style={{ backgroundColor: preset.hex }}
            />
          ))}
          <label
            className="h-6 w-6 rounded-full border-2 border-border grid place-items-center cursor-pointer text-micro text-text-secondary hover:border-text-primary"
            title="Custom colour"
          >
            +
            <input
              type="color"
              value={appearance.accent}
              onChange={(e) => onChange({ accent: e.target.value })}
              className="sr-only"
              aria-label="Custom accent colour"
            />
          </label>
          <span
            className="ml-1 px-2 py-0.5 rounded text-2xs font-medium"
            style={{ backgroundColor: fittedHex, color: rgbToHex(accent.onAccent) }}
          >
            Button
          </span>
        </div>
        <p className="text-xs text-text-tertiary">
          {accent.adjusted
            ? `Darkened to ${fittedHex} for this theme — your pick would be unreadable here (${accent.contrastVsBg.toFixed(1)}:1 after fitting).`
            : `${accent.contrastVsBg.toFixed(1)}:1 against the background. The label flips between white and black automatically.`}
        </p>
      </div>

      <Stepper
        id="app-text-size"
        label="App text size"
        value={appearance.appTextScale}
        steps={APP_TEXT_SCALES}
        format={pct}
        onChange={(appTextScale) => onChange({ appTextScale })}
        help="Scales the agent transcript, session list, explorer and all chrome. This is the one to reach for first — it costs no screen space."
      />

      <Stepper
        id="interface-scale"
        label="Interface scale"
        value={appearance.interfaceScale}
        steps={INTERFACE_SCALES}
        format={pct}
        onChange={(interfaceScale) => onChange({ interfaceScale })}
        help="Zooms the whole window, icons and spacing included. ⌘ + and ⌘ − do the same, and now survive a restart."
      />

      <Stepper
        id="editor-font-size"
        label="Editor & terminal font size"
        value={appearance.editorFontSize}
        steps={EDITOR_FONT_SIZES}
        format={(n) => `${n}px`}
        onChange={(editorFontSize) => onChange({ editorFontSize })}
        help="The code editor and the agent terminal only."
      />

      <div className="mt-6 border-t border-border pt-4 space-y-4">
        <h3 className="text-sm font-medium text-text-primary">Terminal</h3>

        <Stepper
          id="terminal-line-height"
          label="Line spacing"
          value={appearance.terminalLineHeight}
          steps={TERMINAL_LINE_HEIGHTS}
          format={(n) => n.toFixed(1)}
          onChange={(terminalLineHeight) => onChange({ terminalLineHeight })}
          help="Tight leading on a dense terminal is a known readability problem — the eye loses its place between lines."
        />

        <div className="space-y-2">
          <label htmlFor="terminal-contrast" className="text-xs text-text-secondary">
            Minimum contrast
          </label>
          <select
            id="terminal-contrast"
            value={appearance.terminalContrast}
            onChange={(e) =>
              onChange({
                terminalContrast: e.target.value === 'auto' ? 'auto' : Number(e.target.value),
              })
            }
            className="w-full px-3 py-2 text-sm rounded border border-border bg-bg-primary text-text-primary"
          >
            {TERMINAL_CONTRASTS.map((c) => (
              <option key={c} value={c}>
                {c === 'auto'
                  ? resolveTerminalContrast('auto', resolvedTheme) === 1
                    ? 'Automatic (off for this theme)'
                    : `Automatic (${resolveTerminalContrast('auto', resolvedTheme)}:1 for this theme)`
                  : c === 21
                    ? 'Maximum (21:1)'
                    : `${c}:1`}
              </option>
            ))}
          </select>
          <p className="text-xs text-text-tertiary">
            A floor forces agent output to stay legible when a tool prints colours tuned for a
            different background. Automatic turns it off for standard Light (faithful colours), uses
            4.5:1 for High-contrast light, and keeps 7:1 on dark themes.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="w-full px-3 py-2 text-xs rounded border border-border text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors"
      >
        Reset appearance to defaults
      </button>
    </div>
  )
}

interface StepperProps {
  id: string
  label: string
  value: number
  steps: readonly number[]
  format: (n: number) => string
  onChange: (value: number) => void
  help: string
}

function Stepper({ id, label, value, steps, format, onChange, help }: StepperProps) {
  const index = steps.indexOf(value)
  const atMin = index <= 0
  const atMax = index >= steps.length - 1
  const step = (delta: number) => {
    const next = steps[Math.max(0, Math.min(steps.length - 1, index + delta))]
    if (next !== value) onChange(next)
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-xs text-text-secondary">{label}</label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={atMin}
          aria-label={`Decrease ${label}`}
          className="h-9 w-9 shrink-0 rounded border border-border text-text-primary text-sm disabled:opacity-40 hover:bg-bg-tertiary transition-colors"
        >
          −
        </button>
        <output
          id={id}
          aria-live="polite"
          className="flex-1 text-center text-sm tabular-nums text-text-primary py-2 rounded border border-border bg-bg-primary"
        >
          {format(value)}
          {atMax && ' (max)'}
        </output>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={atMax}
          aria-label={`Increase ${label}`}
          className="h-9 w-9 shrink-0 rounded border border-border text-text-primary text-sm disabled:opacity-40 hover:bg-bg-tertiary transition-colors"
        >
          +
        </button>
      </div>
      <p className="text-xs text-text-tertiary">{help}</p>
    </div>
  )
}
