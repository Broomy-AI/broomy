/**
 * Claude Code Hooks-based state tracking
 *
 * This module provides reliable state detection using Claude Code's hooks API
 * instead of fragile terminal output parsing.
 *
 * Hook events we track:
 * - PreToolUse: Claude is about to use a tool (working)
 * - PostToolUse: Claude finished using a tool
 * - PermissionRequest: Claude needs user approval (waiting)
 * - Stop: Claude has stopped (idle)
 */

import type { SessionStatus, WaitingType } from '../store/sessions'

export interface HookEvent {
  type: 'PreToolUse' | 'PostToolUse' | 'PermissionRequest' | 'Stop' | 'Notification'
  timestamp: number
  sessionId: string
  data?: {
    tool?: string
    message?: string
    [key: string]: unknown
  }
}

export interface HookStateResult {
  status: SessionStatus
  waitingType: WaitingType
  lastMessage: string | null
  lastTool: string | null
}

/**
 * Tracks state based on Claude Code hook events
 */
export class ClaudeHooksStateTracker {
  private status: SessionStatus = 'idle'
  private waitingType: WaitingType = null
  private lastMessage: string | null = null
  private lastTool: string | null = null
  private pendingTools: Set<string> = new Set()

  /**
   * Process a hook event and update state
   */
  processEvent(event: HookEvent): HookStateResult {
    switch (event.type) {
      case 'PreToolUse':
        // Tool is starting - we're working (may need approval, but hook fires before that)
        this.status = 'working'
        this.waitingType = null
        if (event.data?.tool) {
          this.lastTool = event.data.tool
          this.pendingTools.add(event.data.tool)
          this.lastMessage = `Using ${event.data.tool}...`
        }
        break

      case 'PostToolUse':
        // Tool finished - clear any waiting state (user approved the tool)
        this.waitingType = null
        if (event.data?.tool) {
          this.pendingTools.delete(event.data.tool)
          this.lastMessage = `${event.data.tool} complete`
        }
        // Stay in working state - Claude might do more until Stop
        this.status = 'working'
        break

      case 'PermissionRequest':
        // Claude needs user approval
        this.status = 'waiting'
        this.waitingType = 'tool'
        if (event.data?.tool) {
          this.lastMessage = `Approve ${event.data.tool}?`
        } else if (event.data?.message) {
          this.lastMessage = event.data.message
        }
        break

      case 'Stop':
        // Claude has stopped - now idle
        this.status = 'idle'
        this.waitingType = null
        this.pendingTools.clear()
        if (event.data?.message) {
          this.lastMessage = event.data.message
        }
        break

      case 'Notification':
        // General notification - update message but not necessarily status
        if (event.data?.message) {
          this.lastMessage = event.data.message
        }
        break
    }

    return this.getState()
  }

  /**
   * Get current state
   */
  getState(): HookStateResult {
    return {
      status: this.status,
      waitingType: this.waitingType,
      lastMessage: this.lastMessage,
      lastTool: this.lastTool,
    }
  }

  /**
   * Reset state (e.g., when session restarts)
   */
  reset(): void {
    this.status = 'idle'
    this.waitingType = null
    this.lastMessage = null
    this.lastTool = null
    this.pendingTools.clear()
  }
}

/**
 * Path where hook events are written
 */
export const HOOKS_EVENT_DIR = '~/.agent-manager/hooks-events'

/**
 * Get the event file path for a session
 */
export function getSessionEventFile(sessionId: string): string {
  return `${HOOKS_EVENT_DIR}/${sessionId}.jsonl`
}
