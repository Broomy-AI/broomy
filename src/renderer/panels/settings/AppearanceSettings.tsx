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
  deriveStatusColor,
  resolveStatusColorRgb,
  resolveTerminalContrast,
  type Appearance,
  type StatusColorPreference,
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

      <StatusColorField
        appearance={appearance}
        resolvedTheme={resolvedTheme}
        accentHex={fittedHex}
        onChange={onChange}
      />

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
                  ? `Automatic (${resolveTerminalContrast('auto', resolvedTheme)}:1 for this theme)`
                  : c === 21
                    ? 'Maximum (21:1)'
                    : `${c}:1`}
              </option>
            ))}
          </select>
          <p className="text-xs text-text-tertiary">
            Forces agent output to stay legible when a tool prints colours tuned for a different
            background. Automatic is theme-aware — the light palette is already legible, so raising
            its floor only muddies the colours.
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

interface StatusColorFieldProps {
  appearance: Appearance
  resolvedTheme: ThemeName
  accentHex: string
  onChange: (patch: Partial<Appearance>) => void
}

/**
 * The "Status indicator colour" control — the semantic green (default), the theme accent,
 * or a custom pick — for the unread "check me" dot and the working spinner. The swatches
 * and the preview render the SAME resolved colour the sidebar will, so what you see is
 * what you get. Split out to keep AppearanceSettings under the max-lines rule.
 */
function StatusColorField({ appearance, resolvedTheme, accentHex, onChange }: StatusColorFieldProps) {
  const statusHex = rgbToHex(resolveStatusColorRgb(appearance, resolvedTheme))
  const greenHex = rgbToHex(resolveStatusColorRgb({ ...appearance, statusColor: 'default' }, resolvedTheme))
  const isCustom = appearance.statusColor !== 'default' && appearance.statusColor !== 'accent'
  const custom = isCustom ? deriveStatusColor(appearance.statusColor, resolvedTheme) : null
  // The non-text floor is theme-aware (higher in high contrast), and fitContrast can move
  // the pick either way — it lightens on a dark ground and darkens on a light one — so the
  // copy says "Adjusted", not "Darkened".
  const floor = resolvedTheme === 'hc' || resolvedTheme === 'hc-light' ? 4.5 : 3
  const help =
    appearance.statusColor === 'accent'
      ? 'Follows your accent colour above.'
      : !isCustom
        ? 'The semantic ready / check-me green, brightened per theme so it stays a vivid non-text indicator.'
        : custom?.adjusted
          ? `Adjusted to ${statusHex} for this theme so the dot stays visible (${custom.contrastVsBg.toFixed(1)}:1, clearing the ${floor}:1 non-text floor).`
          : `${custom?.contrastVsBg.toFixed(1)}:1 against the sidebar — a non-text indicator, so ${floor}:1 is enough.`

  return (
    <div className="space-y-2">
      <span className="text-xs text-text-secondary">Status indicator colour</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange({ statusColor: 'default' })}
          title="Green (default)"
          aria-label="Green (default)"
          aria-pressed={appearance.statusColor === 'default'}
          className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
            appearance.statusColor === 'default' ? 'border-text-primary' : 'border-border'
          }`}
          style={{ backgroundColor: greenHex }}
        />
        <button
          type="button"
          onClick={() => onChange({ statusColor: 'accent' })}
          title="Match accent"
          aria-label="Match accent"
          aria-pressed={appearance.statusColor === 'accent'}
          className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
            appearance.statusColor === 'accent' ? 'border-text-primary' : 'border-border'
          }`}
          style={{ backgroundColor: accentHex }}
        />
        <label
          className={`h-6 w-6 rounded-full border-2 grid place-items-center cursor-pointer text-micro text-text-secondary hover:border-text-primary ${
            isCustom ? 'border-text-primary' : 'border-border'
          }`}
          title="Custom colour"
        >
          +
          <input
            type="color"
            value={isCustom ? appearance.statusColor : statusHex}
            onChange={(e) => onChange({ statusColor: e.target.value as StatusColorPreference })}
            className="sr-only"
            aria-label="Custom status colour"
          />
        </label>
        <span className="ml-1 flex items-center gap-2" aria-hidden="true">
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: statusHex, boxShadow: `0 0 6px 1px ${statusHex}80` }}
          />
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: statusHex }}>
            <circle
              className="opacity-[var(--spinner-track-opacity)]"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-[var(--spinner-arc-opacity)]"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </span>
      </div>
      <p className="text-xs text-text-tertiary">{help}</p>
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
