/**
 * Terminal activity detection: decides when an agent is "working" vs "idle"
 * from terminal output, using timing + rendered-screen-change heuristics.
 *
 * The classic failure mode is an idle agent TUI that repaints its footer/prompt
 * sub-second: treating *any* output as "working" (and re-arming a silence
 * timeout on every byte) pins the session to "working" forever. So activity is
 * gated on the *rendered screen actually changing*, and a "stability lease"
 * caps how long unchanged repaint output may postpone idle.
 *
 * `evaluateActivity` and `computeIdleDeadline` are pure; the caller
 * (ptyDataHandler) owns the screen fingerprinting and the timers.
 *
 * Contract & known limitation: "working" means the visible terminal *text*
 * changed recently. The fingerprint intentionally ignores cursor position and
 * cell attributes, so an agent that genuinely works for longer than
 * `maxStableOutputMs` while displaying byte-identical text (e.g. a static
 * "Thinking…" screen, or an animation expressed only through colours) will be
 * marked idle. This is a deliberate bias toward the far more common failure —
 * an idle TUI repainting forever — and cannot be resolved from the PTY stream
 * alone; a precise signal needs agent-native lifecycle events.
 */

export type ActivityStatus = 'working' | 'idle'

export interface ActivityDetectorConfig {
  /** Ignore activity for this many ms after terminal creation. */
  warmupMs: number
  /** Suppress activity for this many ms after user input (avoids counting echo). */
  inputSuppressionMs: number
  /** Idle after this many ms of no terminal output at all (true silence). */
  idleTimeoutMs: number
  /** Idle after this many ms of output that does NOT change the rendered screen. */
  maxStableOutputMs: number
}

export const DEFAULT_CONFIG: ActivityDetectorConfig = {
  warmupMs: 5000,
  inputSuppressionMs: 200,
  idleTimeoutMs: 1000,
  maxStableOutputMs: 3000,
}

export interface ActivityDetectorState {
  lastUserInput: number
  lastInteraction: number
  startTime: number
}

export interface ActivityResult {
  /** 'working' if this observation is real activity; null for no transition. */
  status: 'working' | null
}

export interface IdleDeadlineInput {
  /** Timestamp of the most recent terminal output (any bytes). */
  lastRawOutputAt: number
  /** Timestamp of the most recent output that changed the rendered screen. */
  lastRenderedChangeAt: number
}

/**
 * Decide whether an observed output sample counts as real activity.
 *
 * Only a *change* to the rendered screen counts — an unchanged repaint does not,
 * so an idle TUI's periodic redraws can never flip the session to "working".
 * Output during warmup or the post-input suppression window is ignored.
 */
export function evaluateActivity(
  changed: boolean,
  now: number,
  state: ActivityDetectorState,
  config: ActivityDetectorConfig = DEFAULT_CONFIG,
): ActivityResult {
  if (now - state.startTime < config.warmupMs) return { status: null }
  if (!changed) return { status: null }
  const isPaused = now - state.lastUserInput < config.inputSuppressionMs ||
                   now - state.lastInteraction < config.inputSuppressionMs
  return { status: isPaused ? null : 'working' }
}

/**
 * The absolute timestamp at which a currently-working session should go idle:
 * the earlier of
 *   (a) `idleTimeoutMs` after the last output of any kind — true silence, and
 *   (b) `maxStableOutputMs` after the last output that actually changed the
 *       screen — the stability-lease cap that defeats idle repaint loops.
 * The caller schedules a timer for `max(0, deadline - now)`.
 */
export function computeIdleDeadline(
  input: IdleDeadlineInput,
  config: ActivityDetectorConfig = DEFAULT_CONFIG,
): number {
  return Math.min(
    input.lastRawOutputAt + config.idleTimeoutMs,
    input.lastRenderedChangeAt + config.maxStableOutputMs,
  )
}
