/**
 * Mock / E2E test helpers for the Agent SDK.
 * Provides canned responses, fake query objects, and mock tool-use flows
 * for deterministic testing without spawning real CLI subprocesses.
 */
import { BrowserWindow } from 'electron'
import { nextMessageId } from './agentSdkHelpers'
import type { AgentSdkMessage, AgentSdkPermissionRequest } from '../../shared/agentSdkTypes'

export interface MockToolUse {
  toolName: string
  toolInput: Record<string, unknown>
  decisionReason?: string
}

export interface SdkQuery {
  close(): void
  interrupt(): Promise<void>
  streamInput(stream: Iterable<unknown> | AsyncIterable<unknown>): Promise<void>
  [Symbol.asyncIterator](): AsyncIterator<Record<string, unknown>>
}

/**
 * Resolve the mock response text for a given prompt.
 */
export function resolveMockResponseText(prompt: string): string {
  try {
    const raw = process.env.E2E_AGENT_RESPONSES
    if (raw) {
      const entries = JSON.parse(raw) as { match: string; response: string }[]
      for (const entry of entries) {
        if (prompt.includes(entry.match)) return entry.response
      }
    }
  } catch {
    // Malformed JSON — fall through to default
  }
  return "I'll help you with that. Let me look at the codebase."
}

/**
 * Create a fake query that validates options and yields mock messages.
 */
export function createFakeQuery(params: { prompt: string; options: Record<string, unknown> }): SdkQuery {
  const opts = params.options
  const errors: string[] = []

  const sources = opts.settingSources as string[] | undefined
  if (!sources?.includes('project')) {
    errors.push('settingSources must include "project" for skills to work')
  }
  if (!opts.tools) {
    errors.push('tools must be configured for skills to work')
  }
  if (!opts.cwd) {
    errors.push('cwd must be set')
  }

  const fakeSessionId = `fake-session-${String(Date.now())}`

  const messages: Record<string, unknown>[] = [
    { type: 'system', subtype: 'init', model: 'fake-sdk-model', session_id: fakeSessionId },
  ]

  if (errors.length > 0) {
    messages.push({
      type: 'result',
      subtype: 'error_during_execution',
      errors: errors.map((e) => ({ message: e })),
      cost_usd: 0,
      duration_ms: 0,
      num_turns: 0,
      session_id: fakeSessionId,
    })
  } else {
    const isSlashCommand = params.prompt.startsWith('/')
    const responseText = isSlashCommand
      ? `Fake SDK: skill "${params.prompt}" executed. settingSources=${JSON.stringify(sources)}, tools=${JSON.stringify(opts.tools)}, cwd=${String(opts.cwd)}`
      : resolveMockResponseText(params.prompt)

    messages.push({
      type: 'assistant',
      message: { content: [{ type: 'text', text: responseText }] },
      parent_tool_use_id: null,
    })
    messages.push({
      type: 'result',
      subtype: 'success',
      result: 'completed',
      cost_usd: 0.001,
      duration_ms: 100,
      num_turns: 1,
      session_id: fakeSessionId,
    })
  }

  let closed = false
  return {
    close() { closed = true },
    interrupt() { closed = true; return Promise.resolve() },
    streamInput() { return Promise.resolve() },
    [Symbol.asyncIterator]() {
      let i = 0
      return {
        next() {
          if (closed || i >= messages.length) return Promise.resolve({ done: true as const, value: undefined })
          return Promise.resolve({ done: false as const, value: messages[i++] })
        },
      }
    },
  }
}

/**
 * Resolve mock tool uses for a given prompt.
 */
function resolveMockToolUses(prompt: string): MockToolUse[] {
  try {
    const raw = process.env.E2E_AGENT_TOOL_USES
    if (raw) {
      const entries = JSON.parse(raw) as { match: string; tools: MockToolUse[] }[]
      for (const entry of entries) {
        if (prompt.includes(entry.match)) return entry.tools
      }
    }
  } catch {
    // Malformed JSON — fall through to empty
  }
  return []
}

/** Tracks which mock sessions have already received their system init message. */
const mockInitSent = new Set<string>()

/**
 * Send a canned mock agent response sequence for E2E tests.
 * Fires system init (first turn only), optional tool_use messages that
 * trigger permission prompts, a text reply, and a result/done.
 */
export function sendMockAgentResponse(
  win: BrowserWindow,
  sessionId: string,
  prompt: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts any session map shape with pendingPermission
  activeSessions?: Map<string, any>,
): void {
  if (!mockInitSent.has(sessionId)) {
    mockInitSent.add(sessionId)
    const initMsg: AgentSdkMessage = {
      id: nextMessageId(),
      type: 'system',
      timestamp: Date.now(),
      text: 'Session initialized (model: claude-sonnet-4-20250514)',
    }
    win.webContents.send(`agentSdk:message:${sessionId}`, initMsg)
  }

  const delayMs = parseInt(process.env.E2E_AGENT_RESPONSE_DELAY_MS ?? '0', 10)
  const mockTools = resolveMockToolUses(prompt)

  const sendResponse = async () => {
    for (const tool of mockTools) {
      const toolUseId = `mock-tooluse-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`
      const toolMsg: AgentSdkMessage = {
        id: nextMessageId(),
        type: 'tool_use',
        timestamp: Date.now(),
        toolName: tool.toolName,
        toolInput: tool.toolInput,
        toolUseId,
      }
      win.webContents.send(`agentSdk:message:${sessionId}`, toolMsg)

      const permReq: AgentSdkPermissionRequest = {
        id: `perm-${String(Date.now())}`,
        toolName: tool.toolName,
        toolInput: tool.toolInput,
        toolUseId,
        decisionReason: tool.decisionReason,
      }
      win.webContents.send(`agentSdk:permission:${sessionId}`, permReq)

      const allowed = await new Promise<boolean>((resolve) => {
        if (!activeSessions) { resolve(true); return }
        let session = activeSessions.get(sessionId)
        if (!session) {
          session = {
            query: null,
            ownerWindow: win,
            pendingPermission: null,
            initSent: true,
            cwd: process.cwd(),
          }
          activeSessions.set(sessionId, session)
        }
        session.pendingPermission = {
          resolve: (result: { behavior: string }) => resolve(result.behavior === 'allow'),
        }
      })

      const resultContent = allowed
        ? `Tool ${tool.toolName} executed successfully.`
        : `Tool ${tool.toolName} was denied by user.`
      const toolResultMsg: AgentSdkMessage = {
        id: nextMessageId(),
        type: 'tool_result',
        timestamp: Date.now(),
        toolUseId,
        toolResult: resultContent,
        isError: !allowed,
      }
      win.webContents.send(`agentSdk:message:${sessionId}`, toolResultMsg)

      if (!allowed) {
        const resultMsg: AgentSdkMessage = {
          id: nextMessageId(),
          type: 'result',
          timestamp: Date.now(),
          result: 'Task stopped — permission denied.',
          costUsd: 0.005,
          durationMs: 1000,
          numTurns: 1,
        }
        win.webContents.send(`agentSdk:message:${sessionId}`, resultMsg)
        win.webContents.send(`agentSdk:done:${sessionId}`, 'mock-session-id')
        return
      }
    }

    const textMsg: AgentSdkMessage = {
      id: nextMessageId(),
      type: 'text',
      timestamp: Date.now(),
      text: resolveMockResponseText(prompt),
    }
    win.webContents.send(`agentSdk:message:${sessionId}`, textMsg)

    const resultMsg: AgentSdkMessage = {
      id: nextMessageId(),
      type: 'result',
      timestamp: Date.now(),
      result: 'Task completed successfully.',
      costUsd: 0.01,
      durationMs: 2000,
      numTurns: 1,
    }
    win.webContents.send(`agentSdk:message:${sessionId}`, resultMsg)
    win.webContents.send(`agentSdk:done:${sessionId}`, 'mock-session-id')
  }

  if (delayMs > 0) {
    setTimeout(() => void sendResponse(), delayMs)
  } else {
    void sendResponse()
  }
}
