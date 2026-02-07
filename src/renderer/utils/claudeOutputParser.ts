import type { SessionStatus } from '../store/sessions'

export interface ParseResult {
  status: SessionStatus | null // null = no change detected
  message: string | null // Meaningful text to display
}

// Spinner characters used by Claude Code
const SPINNER_CHARS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']


// Comprehensive ANSI/terminal escape sequence stripping
// This is intentionally aggressive to catch all terminal control sequences
const ANSI_REGEX = new RegExp([
  // CSI sequences (most common): ESC [ ... letter
  '\\x1b\\[[0-9;?>=!]*[A-Za-z~]',
  // OSC sequences: ESC ] ... (BEL or ST)
  '\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)?',
  // DCS/PM/APC/SOS sequences: ESC P/^/_  ... ST
  '\\x1b[PX^_][^\\x1b]*(?:\\x1b\\\\)?',
  // SS2/SS3 sequences
  '\\x1b[NO][^\\x1b]?',
  // Other ESC sequences
  '\\x1b[\\[\\]()#][0-9;?]*[A-Za-z]?',
  '\\x1b[A-Za-z]',
  // Standalone control characters
  '\\x07|\\x1b',
  // Leftover CSI fragments (numbers followed by letters that look like escape remnants)
  '\\[\\?[0-9]+[a-z]',
].join('|'), 'g')

// Additional cleanup for common escape sequence remnants
const ESCAPE_REMNANTS = /\[\??\d+[hlmnsu]|\d+[A-Za-z](?=[^a-zA-Z]|$)/g

// Patterns that indicate Claude Code is running (not just a regular shell)
const CLAUDE_INDICATORS = [
  /Claude/i,
  /claude-code/i,
  /Anthropic/i,
  /Vibing/i,
  /✻|✳|⏺|⎿/,  // Claude Code status icons
  ...SPINNER_CHARS.map(c => new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
]

// Working indicators - Claude Code specific (including Unicode status chars)
const WORKING_PATTERNS = [
  /[✻✳]\s*(Vibing|Thinking|Working)/i,  // Claude Code's animated status
  /Vibing…/i,
  /Thinking…/i,
  /thinking\)/i,  // "thought for 1s)" or "thinking)"
  /thought for \d+/i,  // "thought for 10s"
  /Reading\s+\S+/i,
  /Writing\s+\S+/i,
  /Editing\s+\S+/i,
  /Searching/i,
  /Analyzing/i,
  /Processing/i,
  /Executing/i,
  /Running/i,
  /tokens\s*·/i,  // Token counter indicates active work
  /↓\s*[\d.]+k?\s*tokens/i,  // Streaming token indicator
  /Burrowing/i,  // Sub-agent activity
  /Launching/i,  // Starting a sub-agent
  /Task\s*\([^)]+\)/i,  // Task tool in progress
]

// Status lines to filter out from message extraction
const STATUS_LINE_PATTERNS = [
  /^[✻✳⏺⎿◇◆●○]\s*(Vibing|Thinking|Working|Burrowing)/i,
  /^\s*Vibing…/i,
  /^\s*Thinking…/i,
  /^\s*Burrowing/i,
  /^\s*Bloviating/i,  // Another Claude thinking indicator
  /^\d+[ms]\s*·/,  // Time indicators like "2m 6s ·"
  /^↓\s*[\d.]+k?\s*tokens/i,  // Token counters
  /^\s*\.\.\.\s*$/,  // Just dots
  /^\s*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]+\s*$/,  // Just spinners
  /ctrl\+[a-z](\s+to|\s*$)/i,  // Keyboard hints like "ctrl+e to explain" or "ctrl+b"
  /^\s*esc\s+to/i,  // "esc to cancel", "esc to interrupt"
  /^\s*tab\s+to/i,  // "tab to amend"
  /^\s*\+\d+\s+lines/i,  // "+20 lines" collapsed indicator
  /^\s*\+\d+\s+more\s+tool/i,  // "+63 more tool uses"
  /^\s*\d+\s+files?\s+[+-]\d+\s+[+-]\d+/i,  // Git status like "2 files +0 -0"
  /^\s*[─━═]+\s*$/,  // Horizontal line separators
  /^\s*❯\s*$/,  // Empty prompt line
  /^\s*❯\s+\d+\./,  // Menu selector line "❯ 1. Yes"
  /^\s*\d+\.\s*(Yes|No)\s*$/,  // Numbered menu options
  /MCP server/i,  // MCP server messages
  /needs auth/i,  // Auth messages
  /Waiting…/i,  // "Waiting..." status
  /Running\s+\w+\s+hook/i,  // "Running PreToolUse hook..."
]

// Action patterns - these are what we WANT to show
const ACTION_PATTERNS = [
  /^[⏺✻✳]\s*(Write|Read|Edit|Bash|Glob|Grep|Task)\s*\(/i,
  /^⎿\s*(Wrote|Read|Edited|Ran|Found)/i,
  /Wrote\s+\d+\s+lines/i,
  /Read\s+\d+\s+lines/i,
  /Found\s+\d+\s+(files?|matches?)/i,
]

export class ClaudeOutputParser {
  private buffer = ''
  private lastStatus: SessionStatus = 'idle'
  private lastMessage: string | null = null
  private lastActionMessage: string | null = null  // Separate tracking for action messages
  private idleTimeout: ReturnType<typeof setTimeout> | null = null
  private hasSeenClaude = false // Only detect states after we've seen Claude

  /**
   * Strip ANSI escape codes from text
   */
  private stripAnsi(text: string): string {
    let result = text.replace(ANSI_REGEX, '')
    // Second pass to catch remnants
    result = result.replace(ESCAPE_REMNANTS, '')
    // Remove any remaining non-printable characters except newlines/tabs
    result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    return result
  }

  /**
   * Check if text contains spinner characters (indicates working)
   */
  private hasSpinner(text: string): boolean {
    return SPINNER_CHARS.some(char => text.includes(char))
  }

  /**
   * Check if we've seen evidence of Claude Code running
   */
  private checkForClaude(text: string): boolean {
    if (this.hasSeenClaude) return true

    for (const pattern of CLAUDE_INDICATORS) {
      if (pattern.test(text)) {
        this.hasSeenClaude = true
        return true
      }
    }
    return false
  }

  /**
   * Detect if the output indicates the agent is working
   */
  private detectWorking(text: string): boolean {
    // Spinner characters indicate active work
    if (this.hasSpinner(text)) return true

    // Check for working keywords
    for (const pattern of WORKING_PATTERNS) {
      if (pattern.test(text)) return true
    }

    // Claude status icons at the START of a line indicate work (not just anywhere)
    // This avoids false positives from decorative UI elements
    const lines = text.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      // Status icon at start followed by any action text (more permissive)
      if (/^[✻✳]\s+\S/i.test(trimmed)) {
        return true
      }
      // Active tool execution (⏺ at start with tool name)
      if (/^⏺\s*(Read|Write|Edit|Bash|Glob|Grep|Task|WebFetch|WebSearch)/i.test(trimmed)) {
        return true
      }
      // Result marker with ongoing action
      if (/^⎿\s*(Reading|Writing|Editing|Running|Executing|Searching)/i.test(trimmed)) {
        return true
      }
    }

    return false
  }

  /**
   * Check if text ends with Claude's idle prompt (❯)
   * Must be careful not to match menu selectors which also use ❯
   */
  private isAtIdlePrompt(text: string): boolean {
    const lines = text.trim().split('\n')

    // First check if we're in a menu context (has numbered options)
    const recentText = lines.slice(-10).join('\n')
    if (/\d+\.\s*(Yes|No)/i.test(recentText)) {
      return false  // In a menu, not idle
    }
    if (/Do you want to/i.test(recentText)) {
      return false  // Approval prompt, not idle
    }
    if (/\[Y\/n\]/i.test(recentText) || /\[y\/N\]/i.test(recentText)) {
      return false  // Confirmation prompt, not idle
    }

    // Look at the last few non-empty lines
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
      const line = lines[i].trim()
      if (!line) continue
      // Check for the Claude Code prompt (❯ alone, not followed by numbers/text)
      if (/^❯\s*$/.test(line)) return true
      // If we find a non-prompt content line, stop
      if (line.length > 2 && !/^[─━═]+$/.test(line)) break
    }
    return false
  }

  /**
   * Check if a line is a status line that should be filtered out
   */
  private isStatusLine(line: string): boolean {
    const trimmed = line.trim()
    for (const pattern of STATUS_LINE_PATTERNS) {
      if (pattern.test(trimmed)) return true
    }
    return false
  }

  /**
   * Check if a line is an action line we want to capture
   */
  private isActionLine(line: string): boolean {
    const trimmed = line.trim()
    for (const pattern of ACTION_PATTERNS) {
      if (pattern.test(trimmed)) return true
    }
    return false
  }

  /**
   * Check if a message looks like garbage (escape sequence remnants, etc.)
   */
  private isGarbageMessage(msg: string): boolean {
    if (!msg || msg.length < 3) return true
    // Count alphabetic characters
    const alphaCount = (msg.match(/[a-zA-Z]/g) || []).length
    // If less than 40% alphabetic, probably garbage
    if (alphaCount / msg.length < 0.4) return true
    // Check for common escape sequence patterns that slipped through
    if (/^[0-9]+[a-z]$/i.test(msg)) return true  // e.g., "2026h", "25l"
    if (/^\[?\??[0-9]+[a-z]*$/i.test(msg)) return true  // e.g., "[?2026", "?25"
    if (/^[a-z]{1,3}$/i.test(msg)) return true  // Very short like "uts", "h"
    return false
  }

  /**
   * Extract a meaningful message from the output
   * Prioritizes action lines over generic output
   */
  private extractMessage(text: string): string | null {
    const cleanText = this.stripAnsi(text)

    // Split into lines
    const lines = cleanText.split('\n')

    // First, look for action lines (Write, Read, Edit results)
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim()
      if (line && this.isActionLine(line)) {
        // Clean up the action line
        let actionMsg = line
          .replace(/^[⏺✻✳⎿]\s*/, '')  // Remove status icons
          .trim()

        if (actionMsg.length > 60) {
          actionMsg = actionMsg.substring(0, 57) + '...'
        }
        return actionMsg
      }
    }

    // If no action line, find last meaningful non-status line
    const meaningfulLines = lines.filter(line => {
      const trimmed = line.trim()
      if (!trimmed) return false
      if (trimmed.length < 3) return false
      if (this.isStatusLine(trimmed)) return false
      // Skip shell prompts
      if (/^[$%>#]\s*$/.test(trimmed)) return false
      // Skip lines that are just special characters
      if (/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✻✳⏺⎿◇◆●○\s]+$/.test(trimmed)) return false
      return true
    })

    if (meaningfulLines.length === 0) return null

    let lastLine = meaningfulLines[meaningfulLines.length - 1].trim()
    // Remove leading status icons
    lastLine = lastLine.replace(/^[⏺✻✳⎿◇◆●○]\s*/, '').trim()

    // Check if this looks like garbage
    if (this.isGarbageMessage(lastLine)) return null

    if (lastLine.length > 60) {
      return lastLine.substring(0, 57) + '...'
    }

    return lastLine || null
  }

  /**
   * Process incoming data from the terminal and determine status/message
   */
  processData(data: string): ParseResult {
    // Clear any pending idle timeout since we got new data
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout)
      this.idleTimeout = null
    }

    // Add to buffer (keep last 2000 chars for context)
    this.buffer += data
    if (this.buffer.length > 2000) {
      this.buffer = this.buffer.slice(-2000)
    }

    const cleanBuffer = this.stripAnsi(this.buffer)

    // Check if this looks like Claude Code output
    this.checkForClaude(cleanBuffer)

    let status: SessionStatus | null = null
    let message: string | null = null

    // Use recent buffer for detection (more reliable than single chunks)
    const recentBuffer = cleanBuffer.slice(-500)

    // Only detect working/idle states if we've seen Claude
    if (this.hasSeenClaude) {
      // Check if at idle prompt first
      if (this.isAtIdlePrompt(this.stripAnsi(recentBuffer))) {
        status = 'idle'
      } else if (this.detectWorking(recentBuffer)) {
        // Check if working - use buffer to avoid chunk boundary issues
        status = 'working'
      }
    }

    // Extract message from the recent buffer (not just the chunk)
    // This avoids issues with escape sequences split across chunks
    message = this.extractMessage(recentBuffer)

    // If we found an action message, remember it
    if (message && this.isActionLine(message)) {
      this.lastActionMessage = message
    }

    // Prefer showing action messages over generic content
    if (!message && this.lastActionMessage) {
      message = this.lastActionMessage
    }

    // Update last known values if we found something
    if (status !== null) {
      this.lastStatus = status
    }
    if (message !== null) {
      this.lastMessage = message
    }

    return {
      status,
      message,
    }
  }

  /**
   * Called when no data has been received for a while
   * Returns idle status if appropriate
   */
  checkIdle(): ParseResult | null {
    // If we're currently working but haven't received data, might still be working
    // Only mark as idle after a longer pause
    if (this.lastStatus === 'working') {
      return null
    }

    // Only return idle if we've seen Claude before
    if (!this.hasSeenClaude) {
      return null
    }

    return {
      status: 'idle',
      message: this.lastMessage,
    }
  }

  /**
   * Get current buffer content (for debugging)
   */
  getBuffer(): string {
    return this.buffer
  }

  /**
   * Check if Claude Code has been detected
   */
  hasDetectedClaude(): boolean {
    return this.hasSeenClaude
  }

  /**
   * Reset the parser state
   */
  reset(): void {
    this.buffer = ''
    this.lastStatus = 'idle'
    this.lastMessage = null
    this.lastActionMessage = null
    this.hasSeenClaude = false
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout)
      this.idleTimeout = null
    }
  }
}
