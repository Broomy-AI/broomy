/**
 * Terminal activity detection logic for determining agent working/idle status.
 *
 * Uses timing heuristics rather than parsing terminal output content. The detector
 * has three phases: a warmup period (ignores the first N ms after creation), an
 * input suppression window (pauses detection briefly after user input or window
 * interaction to avoid false positives), and steady-state detection where any
 * terminal data means "working" and silence means "idle". The evaluateActivity
 * function is pure -- it takes state and config, returns a result with no side effects.
 */

export type ActivityStatus = 'working' | 'idle'

export interface ActivityDetectorConfig {
  /** Ignore activity detection for this many ms after terminal creation */
  warmupMs: number
  /** Suppress detection for this many ms after user input */
  inputSuppressionMs: number
  /** After this many ms of no output, transition to idle */
  idleTimeoutMs: number
}

export const DEFAULT_CONFIG: ActivityDetectorConfig = {
  warmupMs: 5000,
  inputSuppressionMs: 200,
  idleTimeoutMs: 1000,
}

export interface ActivityDetectorState {
  lastUserInput: number
  lastInteraction: number
  lastStatus: ActivityStatus
  startTime: number
}

export interface ActivityResult {
  /** null means no status change should be emitted */
  status: ActivityStatus | null
  /** Whether to schedule an idle timeout */
  scheduleIdle: boolean
}

/**
 * Evaluate terminal data and determine the status transition.
 *
 * @param dataLength Length of incoming terminal data
 * @param now Current timestamp (ms)
 * @param state Current detector state
 * @param config Detector configuration
 * @returns What action to take
 */
export function evaluateActivity(
  dataLength: number,
  now: number,
  state: ActivityDetectorState,
  config: ActivityDetectorConfig = DEFAULT_CONFIG,
): ActivityResult {
  // No data or empty data — no change
  if (dataLength <= 0) {
    return { status: null, scheduleIdle: false }
  }

  // Within warmup period — ignore
  if (now - state.startTime < config.warmupMs) {
    return { status: null, scheduleIdle: false }
  }

  const timeSinceInput = now - state.lastUserInput
  const timeSinceInteraction = now - state.lastInteraction
  const isPaused = timeSinceInput < config.inputSuppressionMs ||
                   timeSinceInteraction < config.inputSuppressionMs

  if (isPaused) {
    // Data arrived but we're in a pause window — schedule idle check
    return { status: null, scheduleIdle: true }
  }

  // Not paused — agent is working
  return { status: 'working', scheduleIdle: true }
}
