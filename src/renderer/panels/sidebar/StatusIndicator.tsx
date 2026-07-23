/**
 * The session status LED — the app's original spinner + dot shapes, only brightened.
 *
 * Colour is the sidebar's one saturated signal (green working / done, red error, blue
 * setting-up, grey idle), sourced from `statusLed.ts` as a NON-TEXT graphic. The dots
 * carry a light-theme bezel ring for contrast; the spinner keeps the app's original
 * clean, rim-less look (a lighter 75% arc). Shared by the session card, the collapsed
 * group-header roll-up, and Archived.
 */
import { useSettingsStore } from '../../store/settings'
import type { SessionStatus } from '../../store/sessions'
import { ledSpec, type LedState } from './statusLed'

const LABELS: Record<LedState, string> = {
  working: 'working',
  idle: 'idle',
  unread: 'done, needs attention',
  error: 'error',
  initializing: 'setting up',
}

function toLedState(status: SessionStatus, isUnread: boolean): LedState {
  if (status === 'initializing') return 'initializing'
  if (status === 'working') return 'working'
  if (status === 'error') return 'error'
  return isUnread ? 'unread' : 'idle'
}

const SPINNER_ARC =
  'M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'

export function StatusIndicator({
  status,
  isUnread,
  small = false,
}: {
  status: SessionStatus
  isUnread: boolean
  small?: boolean
}) {
  const theme = useSettingsStore((s) => s.resolvedTheme)
  const state = toLedState(status, isUnread)
  // Rendered verbatim from `statusLed.ts` — the exact values statusLed.test.ts asserts the
  // 3:1 non-text floor against, so the contrast test judges what actually reaches the DOM.
  const { fill, bezel, glow } = ledSpec(theme, state)
  const label = LABELS[state]

  // Live states keep the app's original animated spinner; the rest are dots.
  if (state === 'working' || state === 'initializing') {
    const size = small ? 10 : 13
    return (
      <svg
        role="img"
        aria-label={label}
        className="animate-spin flex-shrink-0 motion-reduce:animate-none"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        style={{ color: fill }}
      >
        {/* The app's original spinner: a faint 25% track ring + a lighter 75% arc, one
            colour, kept rim-less and light. The default colour is dark enough to stay
            visible on white without any outline. */}
        <circle
          aria-hidden="true"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
          style={{ opacity: 0.25 }}
        />
        <path aria-hidden="true" fill="currentColor" fillOpacity={0.75} d={SPINNER_ARC} />
      </svg>
    )
  }

  // Dots. unread is the larger glowing "check me"; idle/error are the small quiet dots.
  const px = state === 'unread' ? (small ? 9 : 12) : small ? 7 : 8
  const shadows: string[] = []
  if (bezel) shadows.push(`0 0 0 1.25px ${bezel}`)
  if (glow) shadows.push(`0 0 6px 1px ${glow}`)
  return (
    <span
      role="img"
      aria-label={label}
      className="rounded-full inline-block flex-shrink-0"
      style={{
        width: px,
        height: px,
        background: fill,
        boxShadow: shadows.length ? shadows.join(', ') : undefined,
      }}
    />
  )
}

export default StatusIndicator
