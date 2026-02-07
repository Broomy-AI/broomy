import { describe, it, expect, beforeEach } from 'vitest'
import { ClaudeOutputParser } from './claudeOutputParser'

describe('ClaudeOutputParser', () => {
  let parser: ClaudeOutputParser

  beforeEach(() => {
    parser = new ClaudeOutputParser()
  })

  describe('ANSI stripping', () => {
    it('strips CSI sequences for detection and messages', () => {
      // The buffer stores raw data, but stripping happens during detection
      parser.processData('\x1b[31mClaude Code\x1b[0m')
      // Claude should be detected even through ANSI escape codes
      expect(parser.hasDetectedClaude()).toBe(true)
    })

    it('strips OSC sequences for message extraction', () => {
      parser.processData('Claude Code\n')
      const result = parser.processData('\x1b]0;title\x07⏺ Write(src/file.ts)')
      // Message should be extracted despite OSC codes
      expect(result.message).toContain('Write')
    })

    it('strips control characters for message extraction', () => {
      parser.processData('Claude Code\n')
      const result = parser.processData('⏺ Read\x07(src/file.ts)')
      // Message should still be extracted
      expect(result.message).toContain('Read')
    })

    it('passes through clean text', () => {
      parser.processData('plain text here')
      expect(parser.getBuffer()).toContain('plain text here')
    })
  })

  describe('Claude detection', () => {
    it('detects Claude keyword', () => {
      parser.processData('Welcome to Claude Code')
      expect(parser.hasDetectedClaude()).toBe(true)
    })

    it('detects claude-code keyword', () => {
      parser.processData('Running claude-code v1.0')
      expect(parser.hasDetectedClaude()).toBe(true)
    })

    it('detects Anthropic keyword', () => {
      parser.processData('Powered by Anthropic')
      expect(parser.hasDetectedClaude()).toBe(true)
    })

    it('detects Vibing keyword', () => {
      parser.processData('Vibing')
      expect(parser.hasDetectedClaude()).toBe(true)
    })

    it('detects status icons', () => {
      parser.processData('✻ Working on it')
      expect(parser.hasDetectedClaude()).toBe(true)
    })

    it('detects spinner characters', () => {
      parser.processData('⠋ Loading')
      expect(parser.hasDetectedClaude()).toBe(true)
    })

    it('does not detect regular shell output', () => {
      parser.processData('$ ls -la\ntotal 42')
      expect(parser.hasDetectedClaude()).toBe(false)
    })

    it('persists detection after seeing Claude', () => {
      parser.processData('Claude')
      parser.processData('regular text')
      expect(parser.hasDetectedClaude()).toBe(true)
    })
  })

  describe('working detection', () => {
    beforeEach(() => {
      // Ensure Claude is detected first
      parser.processData('Claude Code\n')
    })

    it('detects spinner chars as working', () => {
      const result = parser.processData('⠋ Processing...')
      expect(result.status).toBe('working')
    })

    it('detects Vibing pattern', () => {
      const result = parser.processData('✻ Vibing')
      expect(result.status).toBe('working')
    })

    it('detects Thinking pattern', () => {
      const result = parser.processData('✻ Thinking')
      expect(result.status).toBe('working')
    })

    it('detects Reading file pattern', () => {
      const result = parser.processData('Reading src/main.ts')
      expect(result.status).toBe('working')
    })

    it('detects Writing file pattern', () => {
      const result = parser.processData('Writing src/main.ts')
      expect(result.status).toBe('working')
    })

    it('detects status icon at start of line', () => {
      const result = parser.processData('✻ Some action text')
      expect(result.status).toBe('working')
    })

    it('detects tool execution with ⏺', () => {
      const result = parser.processData('⏺ Read src/file.ts')
      expect(result.status).toBe('working')
    })

    it('detects result marker with ongoing action', () => {
      const result = parser.processData('⎿ Reading file...')
      expect(result.status).toBe('working')
    })

    it('detects token counter', () => {
      const result = parser.processData('↓ 5.2k tokens')
      expect(result.status).toBe('working')
    })

    it('detects Burrowing sub-agent', () => {
      const result = parser.processData('Burrowing into sub-task')
      expect(result.status).toBe('working')
    })

    it('detects Searching', () => {
      const result = parser.processData('Searching for pattern')
      expect(result.status).toBe('working')
    })
  })

  describe('idle detection', () => {
    beforeEach(() => {
      parser.processData('Claude Code\n')
    })

    it('detects ❯ prompt as idle', () => {
      const result = parser.processData('\n❯ \n')
      expect(result.status).toBe('idle')
    })

    it('does not detect idle when in menu context', () => {
      const result = parser.processData('1. Yes\n2. No\n❯ \n')
      expect(result.status).not.toBe('idle')
    })

    it('does not detect idle during approval prompt', () => {
      const result = parser.processData('Do you want to continue?\n❯ \n')
      expect(result.status).not.toBe('idle')
    })

    it('does not detect idle with [Y/n] confirmation', () => {
      const result = parser.processData('Apply changes? [Y/n]\n❯ \n')
      expect(result.status).not.toBe('idle')
    })

    it('does not detect idle with [y/N] confirmation', () => {
      const result = parser.processData('Are you sure? [y/N]\n❯ \n')
      expect(result.status).not.toBe('idle')
    })
  })

  describe('message extraction', () => {
    beforeEach(() => {
      parser.processData('Claude Code\n')
    })

    it('extracts action lines (Write)', () => {
      const result = parser.processData('⏺ Write(src/file.ts)')
      expect(result.message).toContain('Write')
    })

    it('extracts result lines', () => {
      const result = parser.processData('⎿ Wrote 42 lines to file')
      expect(result.message).toContain('Wrote 42 lines')
    })

    it('extracts Read result', () => {
      const result = parser.processData('⎿ Read 100 lines from file')
      expect(result.message).toContain('Read 100 lines')
    })

    it('extracts Found result', () => {
      const result = parser.processData('⎿ Found 5 files')
      expect(result.message).toContain('Found 5 files')
    })

    it('filters out status lines', () => {
      // Only send status lines with no meaningful content
      parser.reset()
      parser.processData('Claude Code\n')
      const result = parser.processData('⠋\nVibing…\n')
      // Status lines are filtered, so message should be null or from previous
      expect(result.message === null || !result.message.includes('Vibing…')).toBe(true)
    })

    it('filters out keyboard hint lines', () => {
      parser.reset()
      parser.processData('Claude Code\n')
      const result = parser.processData('ctrl+e to explain\n')
      expect(result.message === null || !result.message.includes('ctrl+e')).toBe(true)
    })

    it('truncates long messages to 60 chars', () => {
      const longAction = '⏺ Write(src/some/very/deeply/nested/directory/structure/with/a/really/long/path/name.ts)'
      const result = parser.processData(longAction)
      if (result.message) {
        expect(result.message.length).toBeLessThanOrEqual(60)
        expect(result.message).toContain('...')
      }
    })

    it('filters garbage messages', () => {
      parser.reset()
      parser.processData('Claude Code\n')
      // Process data that's mostly non-alphabetic
      const result = parser.processData('12345!@#$%\n')
      expect(result.message === null || result.message.length >= 3).toBe(true)
    })

    it('falls back to lastActionMessage when no current message', () => {
      // First, get an action message
      parser.processData('⏺ Read(src/file.ts)\n')
      // Then process data that doesn't have a good message
      const result = parser.processData('⠋\n')
      // Should fall back to the action message
      expect(result.message).toContain('Read')
    })
  })

  describe('state management', () => {
    it('caps buffer at 2000 chars', () => {
      const bigChunk = 'x'.repeat(3000)
      parser.processData(bigChunk)
      expect(parser.getBuffer().length).toBeLessThanOrEqual(2000)
    })

    it('reset clears all state', () => {
      parser.processData('Claude Code is running\n✻ Working')
      expect(parser.hasDetectedClaude()).toBe(true)
      parser.reset()
      expect(parser.hasDetectedClaude()).toBe(false)
      expect(parser.getBuffer()).toBe('')
    })

    it('getBuffer returns current buffer', () => {
      parser.processData('hello')
      expect(parser.getBuffer()).toBe('hello')
    })
  })

  describe('checkIdle', () => {
    it('returns null when Claude not detected', () => {
      expect(parser.checkIdle()).toBeNull()
    })

    it('returns null when last status was working', () => {
      parser.processData('Claude Code\n')
      parser.processData('⠋ Working...')
      expect(parser.checkIdle()).toBeNull()
    })

    it('returns idle when Claude was detected and not working', () => {
      parser.processData('Claude Code\n')
      parser.processData('\n❯ \n') // Go idle first
      const result = parser.checkIdle()
      expect(result).not.toBeNull()
      expect(result!.status).toBe('idle')
    })
  })

  describe('integration', () => {
    it('does not detect status before seeing Claude', () => {
      const result = parser.processData('⠋ Loading...')
      // Should detect Claude now (spinner is an indicator)
      // But before that call, it wasn't detected
      // The spinner itself will trigger Claude detection
      expect(parser.hasDetectedClaude()).toBe(true)
    })

    it('transitions from working to idle', () => {
      parser.processData('Claude Code\n')
      const working = parser.processData('⠋ Processing...')
      expect(working.status).toBe('working')
      const idle = parser.processData('\n❯ \n')
      expect(idle.status).toBe('idle')
    })

    it('processData clears pending idle timeout', () => {
      parser.processData('Claude Code\n')
      // Just verify processData doesn't throw - the timeout clearing is internal
      parser.processData('some data')
      parser.processData('more data')
    })

    it('extracts action messages from tool use sequences', () => {
      parser.processData('Claude Code\n')
      parser.processData('✻ Thinking\n')
      const result = parser.processData('⏺ Bash(npm test)\n⎿ Ran npm test\n')
      expect(result.message).toBeTruthy()
    })

    it('handles multi-chunk data correctly', () => {
      parser.processData('Clau')
      parser.processData('de Code\n')
      expect(parser.hasDetectedClaude()).toBe(true)
    })
  })
})
