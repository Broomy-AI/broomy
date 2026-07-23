// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import '../../../test/react-setup'
import { StatusIndicator } from './StatusIndicator'
import { STATUS_LED } from './statusLed'
import { useSettingsStore } from '../../store/settings'
import type { SessionStatus } from '../../store/sessions'
import { THEMES } from '../../../shared/theme'
import { hexToRgb } from '../../../shared/color'

afterEach(() => useSettingsStore.setState({ resolvedTheme: 'dark' }))

const squash = (s: string) => s.replace(/\s+/g, '').toLowerCase()

/** True if `css` mentions `color`, either literally or in jsdom's normalised rgb()/rgba() form. */
function mentionsColor(css: string, color: string): boolean {
  const hay = squash(css)
  if (hay.includes(squash(color))) return true
  if (!color.startsWith('#')) return false
  const [r, g, b] = hexToRgb(color)
  return hay.includes(`rgb(${r},${g},${b})`)
}

describe('StatusIndicator', () => {
  it('exposes exactly one accessible image with a per-state label', () => {
    const cases: [SessionStatus, boolean, string][] = [
      ['working', false, 'working'],
      ['idle', false, 'idle'],
      ['idle', true, 'done, needs attention'],
      ['error', false, 'error'],
      ['initializing', false, 'setting up'],
    ]
    for (const [status, unread, label] of cases) {
      const { container, unmount } = render(<StatusIndicator status={status} isUnread={unread} />)
      const imgs = container.querySelectorAll('[role="img"]')
      expect(imgs).toHaveLength(1)
      expect(imgs[0].getAttribute('aria-label')).toBe(label)
      unmount()
    }
  })

  it('uses dedicated inline LED colours, not the text-token classes', () => {
    const { container } = render(<StatusIndicator status="idle" isUnread={true} />)
    const dot = container.querySelector<HTMLElement>('[role="img"]')!
    expect(dot.style.background).not.toBe('')
    // unread is the single glowing state
    expect(dot.style.boxShadow).toContain('px')
    // never the removed class-based tokens
    expect(container.querySelector('.bg-success-fg')).toBeNull()
    expect(container.querySelector('.bg-status-error')).toBeNull()
    expect(container.querySelector('.bg-status-idle')).toBeNull()
  })

  it('renders the declared statusLed fill/bezel/glow verbatim — the values the contrast test checks', () => {
    // statusLed.test.ts asserts the 3:1 non-text floor against STATUS_LED[theme][state].bezel.
    // That assertion only means anything if the DOM receives that exact value, so pin it here:
    // no var(), no color-mix, nothing derived at render time.
    for (const { id: theme } of THEMES) {
      useSettingsStore.setState({ resolvedTheme: theme })
      const spec = STATUS_LED[theme].unread
      const { container, unmount } = render(<StatusIndicator status="idle" isUnread={true} />)
      const dot = container.querySelector<HTMLElement>('[role="img"]')!
      expect(dot.style.background).not.toContain('var(')
      expect(dot.style.boxShadow).not.toContain('color-mix')
      expect(mentionsColor(dot.style.background, spec.fill)).toBe(true)
      if (spec.bezel) expect(mentionsColor(dot.style.boxShadow, spec.bezel)).toBe(true)
      if (spec.glow) expect(mentionsColor(dot.style.boxShadow, spec.glow)).toBe(true)
      unmount()
    }
  })

  it('keeps the app\'s animated spinner for the live states', () => {
    for (const status of ['working', 'initializing'] as SessionStatus[]) {
      const { container, unmount } = render(<StatusIndicator status={status} isUnread={false} />)
      expect(container.querySelector('.animate-spin')).toBeTruthy()
      unmount()
    }
  })

  it('renders the app\'s original rim-less spinner — a single light 75% arc, no stroke', () => {
    useSettingsStore.setState({ resolvedTheme: 'light' })
    const { container } = render(<StatusIndicator status="working" isUnread={false} />)
    const paths = container.querySelectorAll('path')
    expect(paths.length).toBe(1)
    const arc = paths[0]
    // deliberately light: a plain 75% fill, no rim / stroke / offset duplicate on the arc.
    expect(arc.getAttribute('fill-opacity')).toBe('0.75')
    expect(arc.getAttribute('stroke')).toBeNull()
    expect(arc.getAttribute('transform')).toBeNull()
    // the track ring is a faint currentColor, not a darker bezel ring.
    expect(container.querySelector('circle')!.getAttribute('stroke')).toBe('currentColor')
  })

  it('marks decorative spinner geometry aria-hidden', () => {
    const { container } = render(<StatusIndicator status="working" isUnread={false} />)
    const svg = container.querySelector<SVGElement>('[role="img"]')!
    // the circle + path are decorative
    expect(svg.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(2)
  })
})
