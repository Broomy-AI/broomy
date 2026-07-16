import { describe, it, expect } from 'vitest'
import {
  evaluateActivity,
  computeIdleDeadline,
  type ActivityDetectorState,
  type ActivityDetectorConfig,
} from './terminalActivityDetector'

function makeState(overrides: Partial<ActivityDetectorState> = {}): ActivityDetectorState {
  return {
    lastUserInput: 0,
    lastInteraction: 0,
    startTime: 0,
    ...overrides,
  }
}

describe('evaluateActivity', () => {
  describe('warmup period', () => {
    it('ignores a screen change during warmup', () => {
      const state = makeState({ startTime: 1000 })
      // now=4999, startTime=1000 → 3999ms < 5000ms warmup
      expect(evaluateActivity(true, 4999, state).status).toBeNull()
    })

    it('detects a screen change after warmup', () => {
      const state = makeState({ startTime: 0 })
      expect(evaluateActivity(true, 5001, state).status).toBe('working')
    })

    it('ignores a change at the exact warmup boundary', () => {
      const state = makeState({ startTime: 0 })
      expect(evaluateActivity(true, 4999, state).status).toBeNull()
    })
  })

  describe('unchanged screen', () => {
    it('never counts an unchanged repaint as activity — the core fix', () => {
      const state = makeState({ startTime: 0 })
      // Well past warmup, no input suppression, but the screen did not change.
      expect(evaluateActivity(false, 100000, state).status).toBeNull()
    })
  })

  describe('user input suppression', () => {
    it('suppresses a change when the user typed recently', () => {
      const state = makeState({ startTime: 0, lastUserInput: 9900 }) // 100ms ago
      expect(evaluateActivity(true, 10000, state).status).toBeNull()
    })

    it('suppresses a change when window interaction happened recently', () => {
      const state = makeState({ startTime: 0, lastInteraction: 9900 }) // 100ms ago
      expect(evaluateActivity(true, 10000, state).status).toBeNull()
    })

    it('does not suppress when input was long ago', () => {
      const state = makeState({ startTime: 0, lastUserInput: 9700, lastInteraction: 9700 }) // 300ms ago
      expect(evaluateActivity(true, 10000, state).status).toBe('working')
    })
  })

  describe('working transition', () => {
    it('returns working when a change arrives outside the suppression window', () => {
      const state = makeState({ startTime: 0 })
      expect(evaluateActivity(true, 10000, state).status).toBe('working')
    })
  })

  describe('custom config', () => {
    it('respects custom warmup period', () => {
      const config: ActivityDetectorConfig = { warmupMs: 1000, inputSuppressionMs: 200, idleTimeoutMs: 1000, maxStableOutputMs: 3000 }
      const state = makeState({ startTime: 0 })
      expect(evaluateActivity(true, 999, state, config).status).toBeNull()
      expect(evaluateActivity(true, 1001, state, config).status).toBe('working')
    })

    it('respects custom input suppression', () => {
      const config: ActivityDetectorConfig = { warmupMs: 0, inputSuppressionMs: 500, idleTimeoutMs: 1000, maxStableOutputMs: 3000 }
      const state = makeState({ startTime: 0, lastUserInput: 9600 }) // 400ms ago (< 500ms)
      expect(evaluateActivity(true, 10000, state, config).status).toBeNull()
    })
  })
})

describe('computeIdleDeadline', () => {
  const config: ActivityDetectorConfig = { warmupMs: 5000, inputSuppressionMs: 200, idleTimeoutMs: 1000, maxStableOutputMs: 3000 }

  it('uses the silence timeout while the screen keeps changing (recent render change)', () => {
    // Raw output and rendered change both at t=10000 → silence term (11000) < cap (13000).
    expect(computeIdleDeadline({ lastRawOutputAt: 10000, lastRenderedChangeAt: 10000 }, config)).toBe(11000)
  })

  it('uses the stability cap when output continues but the screen is stale', () => {
    // Repaints keep arriving (raw output at 12000) but the screen last changed at 10000.
    // cap (10000+3000=13000) < silence (12000+1000=13000)? equal here; make raw more recent:
    expect(computeIdleDeadline({ lastRawOutputAt: 12500, lastRenderedChangeAt: 10000 }, config)).toBe(13000)
  })

  it('the cap defeats an infinite repaint loop — deadline stops advancing with raw output', () => {
    const stale = 10000
    // No matter how much later raw output keeps arriving, the deadline is pinned to stale+cap.
    expect(computeIdleDeadline({ lastRawOutputAt: 999999, lastRenderedChangeAt: stale }, config)).toBe(stale + 3000)
  })
})
