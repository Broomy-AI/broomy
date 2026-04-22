/**
 * Shared types for the Agent SDK integration, used by both main and renderer processes.
 */

export type AgentSdkMessageType = 'text' | 'tool_use' | 'tool_result' | 'system' | 'result' | 'error'

export interface AgentSdkMessage {
  id: string
  type: AgentSdkMessageType
  timestamp: number
  // For text messages
  text?: string
  // For tool_use
  toolName?: string
  toolInput?: Record<string, unknown>
  toolUseId?: string
  // For tool_result
  toolResult?: string
  isError?: boolean
  // For result
  result?: string
  costUsd?: number
  durationMs?: number
  numTurns?: number
  // For subagents
  parentToolUseId?: string | null
  // True while the message has been injected mid-turn but the agent hasn't
  // seen it yet. Cleared when the next agent message arrives (or on turn end).
  queued?: boolean
}

export interface AgentSdkPermissionRequest {
  id: string
  toolName: string
  toolInput: Record<string, unknown>
  toolUseId: string
  decisionReason?: string
}

export type AgentSdkSessionState = 'idle' | 'running' | 'awaiting_permission' | 'error'
