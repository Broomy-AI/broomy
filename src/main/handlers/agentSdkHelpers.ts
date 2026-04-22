/**
 * Helper functions for the Agent SDK IPC handlers.
 * Uses the V1 query() API for one-off queries (status, commands, models)
 * and getSessionMessages() for history loading.
 */
import { app, BrowserWindow } from 'electron'
import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { spawn } from 'child_process'
import { resolveCommand } from '../platform'
import type { AgentSdkMessage } from '../../shared/agentSdkTypes'

/**
 * Resolve the path to the Agent SDK's cli.js for use as pathToClaudeCodeExecutable.
 *
 * In dev mode, require.resolve finds it directly in node_modules.
 * In packaged builds, node_modules is inside app.asar but asarUnpack extracts
 * the SDK to app.asar.unpacked/. The SDK's own resolution uses import.meta.url
 * which still points inside the asar, so child_process.spawn fails. We detect
 * the asar path and rewrite it to the unpacked location.
 */
export function resolveAgentSdkCliPath(): string {
  let sdkEntry: string
  try {
    sdkEntry = require.resolve('@anthropic-ai/claude-agent-sdk')
  } catch {
    throw new Error('Cannot resolve @anthropic-ai/claude-agent-sdk — is it installed?')
  }

  const cliPath = join(dirname(sdkEntry), 'cli.js')

  // In packaged builds, rewrite app.asar to app.asar.unpacked
  const sep = process.platform === 'win32' ? '\\' : '/'
  if (app.isPackaged && cliPath.includes(`app.asar${sep}`)) {
    const unpackedPath = cliPath.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`)
    if (existsSync(unpackedPath)) {
      console.log('[agentSdk] Using unpacked CLI path:', unpackedPath)
      return unpackedPath
    }
    console.warn('[agentSdk] Expected unpacked path not found:', unpackedPath, '— falling back to:', cliPath)
  }

  return cliPath
}

export function expandHome(value: string): string {
  if (value.startsWith('~/')) return join(homedir(), value.slice(2))
  if (value === '~') return homedir()
  return value
}

let messageCounter = 0
export function nextMessageId(): string {
  return `sdk-msg-${String(++messageCounter)}-${String(Date.now())}`
}

export function sendMsg(win: BrowserWindow, sessionId: string, msg: AgentSdkMessage): void {
  win.webContents.send(`agentSdk:message:${sessionId}`, msg)
}

/** Temporarily set CLAUDE_CONFIG_DIR, run a function, then restore. */
export async function withConfigDir<T>(agentEnv: Record<string, string> | undefined, fn: () => Promise<T>): Promise<T> {
  const configDir = agentEnv?.CLAUDE_CONFIG_DIR
  const prevConfigDir = process.env.CLAUDE_CONFIG_DIR
  if (configDir) process.env.CLAUDE_CONFIG_DIR = expandHome(configDir)
  try {
    return await fn()
  } finally {
    if (configDir) {
      if (prevConfigDir) process.env.CLAUDE_CONFIG_DIR = prevConfigDir
      else delete process.env.CLAUDE_CONFIG_DIR
    }
  }
}

export async function handleLoadHistory(
  senderWindow: BrowserWindow,
  sdkSessionId: string,
  sessionId: string,
  agentEnv?: Record<string, string>,
  limit?: number,
): Promise<void> {
  await withConfigDir(agentEnv, async () => {
    const { getSessionMessages } = await import('@anthropic-ai/claude-agent-sdk')
    const allMessages = await getSessionMessages(sdkSessionId)

    const maxVisibleItems = limit ?? 50

    // Count "visible items" rather than raw messages.  Tool-use blocks from
    // the same assistant turn all collapse into a single rendered line, so
    // they should count as one item toward the limit.
    let visibleCount = 0
    let cutIndex = 0 // index in allMessages where the visible portion starts
    let prevWasToolUse = false
    for (let i = allMessages.length - 1; i >= 0; i--) {
      const entry = allMessages[i] as Record<string, unknown>
      const entryType = entry.type as string
      const message = entry.message as Record<string, unknown> | undefined
      const content = message?.content as Record<string, unknown>[] | string | undefined

      // Determine if this entry is purely tool_use blocks
      const isToolUse = entryType === 'assistant'
        && Array.isArray(content)
        && content.length > 0
        && content.every((b) => b.type === 'tool_use')

      if (isToolUse && prevWasToolUse) {
        // Consecutive tool_use entries collapse together — don't increment
      } else {
        visibleCount++
      }
      prevWasToolUse = isToolUse

      if (visibleCount > maxVisibleItems) {
        cutIndex = i + 1
        break
      }
    }

    const history = cutIndex > 0 ? allMessages.slice(cutIndex) : allMessages

    if (cutIndex > 0) {
      senderWindow.webContents.send(`agentSdk:historyMeta:${sessionId}`, {
        total: allMessages.length,
        loaded: history.length,
      })
    }

    for (const entry of history) {
      const entryType = (entry as Record<string, unknown>).type as string
      const message = (entry as Record<string, unknown>).message as Record<string, unknown> | undefined
      if (!message) continue
      const content = message.content as Record<string, unknown>[] | string | undefined
      if (!content) continue

      const idPrefix = entryType === 'user' ? 'history-user' : 'history-asst'
      const blocks = typeof content === 'string'
        ? [{ type: 'text', text: content }] as Record<string, unknown>[]
        : Array.isArray(content) ? content : []

      for (const block of blocks) {
        if (block.type === 'text' && typeof block.text === 'string') {
          sendMsg(senderWindow, sessionId, {
            id: `${idPrefix}-${nextMessageId()}`, type: 'text', timestamp: Date.now(), text: block.text,
          })
        } else if (entryType === 'assistant' && block.type === 'tool_use') {
          sendMsg(senderWindow, sessionId, {
            id: `history-tool-${nextMessageId()}`, type: 'tool_use', timestamp: Date.now(),
            toolName: block.name as string, toolInput: block.input as Record<string, unknown>, toolUseId: block.id as string,
          })
        }
      }
    }
  })
}

export async function handleStatus(
  senderWindow: BrowserWindow,
  sessionId: string,
  sdkSessionId: string | undefined,
  agentEnv?: Record<string, string>,
): Promise<void> {
  const rows: [string, string][] = [
    ['Status', sdkSessionId ? 'Active' : 'Idle'],
    ['Session', sdkSessionId ?? 'none'],
  ]

  try {
    await withConfigDir(agentEnv, async () => {
      const { query: sdkQuery } = await import('@anthropic-ai/claude-agent-sdk')
      const q = sdkQuery({
        prompt: '/cost',
        options: { pathToClaudeCodeExecutable: resolveAgentSdkCliPath(), env: process.env, settingSources: ['user'], maxTurns: 0 },
      })
      const account = await q.accountInfo()
      if (account.email) rows.push(['Account', account.email])
      if (account.subscriptionType) rows.push(['Plan', account.subscriptionType])
      q.close()
    })
  } catch {
    // Ignore
  }

  const tableRows = rows.map(([k, v]) => `| **${k}** | ${v} |`).join('\n')
  const table = `| | |\n|---|---|\n${tableRows}`

  sendMsg(senderWindow, sessionId, {
    id: nextMessageId(), type: 'text', timestamp: Date.now(), text: table,
  })
  senderWindow.webContents.send(`agentSdk:done:${sessionId}`, sdkSessionId ?? '')
}

export type SdkModelInfo = {
  value: string
  displayName: string
  description: string
  supportsEffort?: boolean
  supportedEffortLevels?: ('low' | 'medium' | 'high' | 'max')[]
  supportsAdaptiveThinking?: boolean
}

export async function handleFetchModels(agentEnv?: Record<string, string>): Promise<SdkModelInfo[]> {
  return withConfigDir(agentEnv, async () => {
    try {
      const { query: sdkQuery } = await import('@anthropic-ai/claude-agent-sdk')
      const q = sdkQuery({
        prompt: '/cost',
        options: {
          pathToClaudeCodeExecutable: resolveAgentSdkCliPath(),
          env: process.env,
          settingSources: ['user'],
          maxTurns: 0,
        },
      })
      const models = await q.supportedModels() as SdkModelInfo[]
      q.close()
      return models
    } catch {
      return []
    }
  })
}

export async function handleFetchCommands(cwd?: string, agentEnv?: Record<string, string>): Promise<{ name: string; description: string }[]> {
  return withConfigDir(agentEnv, async () => {
    try {
      const { query: sdkQuery } = await import('@anthropic-ai/claude-agent-sdk')
      const q = sdkQuery({
        prompt: '/cost',
        options: {
          pathToClaudeCodeExecutable: resolveAgentSdkCliPath(),
          cwd: cwd || process.cwd(),
          env: process.env,
          tools: { type: 'preset', preset: 'claude_code' },
          settingSources: ['user', 'project'],
          maxTurns: 0,
        },
      })
      const cmds = await q.supportedCommands()
      q.close()
      return cmds.map((c: Record<string, unknown>) => ({
        name: c.name as string,
        description: (typeof c.description === 'string' ? c.description : '').split('\n')[0].slice(0, 80),
      }))
    } catch {
      return []
    }
  })
}

/** Check if an error message indicates the SDK session no longer exists. */
export function isSessionNotFoundError(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('no conversation found') || lower.includes('session not found')
}

/** Minimal shape of the V1 Query object (dynamically imported). */
export interface SdkQuery {
  close(): void
  interrupt(): Promise<void>
  streamInput(stream: Iterable<unknown> | AsyncIterable<unknown>): Promise<void>
  [Symbol.asyncIterator](): AsyncIterator<Record<string, unknown>>
}

/**
 * Resolve the mock response text for a given prompt.
 *
 * Reads E2E_AGENT_RESPONSES (JSON array of {match, response} objects) and
 * returns the text of the first entry whose `match` string appears in the
 * prompt. Falls back to a generic placeholder when nothing matches.
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
 * Used in E2E tests (E2E_FAKE_SDK=true) to exercise the real buildQueryOptions
 * and runTurn code paths without spawning a subprocess.
 */
export function createFakeQuery(params: { prompt: string; options: Record<string, unknown> }): SdkQuery {
  const opts = params.options
  const errors: string[] = []

  // Validate that critical options are set
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

/** Tracks which mock sessions have already received their system init message. */
const mockInitSent = new Set<string>()

/**
 * Send a canned mock agent response sequence for E2E tests.
 * Fires system init (first turn only), a text reply, and a result/done.
 * When E2E_AGENT_RESPONSE_DELAY_MS is set, the text+result+done are
 * deferred by that many milliseconds so tests can inject mid-turn messages.
 */
export function sendMockAgentResponse(win: BrowserWindow, sessionId: string, prompt: string): void {
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

  const sendResponse = () => {
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
    setTimeout(sendResponse, delayMs)
  } else {
    sendResponse()
  }
}

export function handleLogin(senderWindow: BrowserWindow, sessionId: string): void {
  const claudePath = resolveCommand('claude') ?? 'claude'
  const child = spawn(claudePath, ['login'], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  child.stdout.on('data', (data: Buffer) => { output += data.toString() })
  child.stderr.on('data', (data: Buffer) => { output += data.toString() })

  sendMsg(senderWindow, sessionId, {
    id: nextMessageId(), type: 'system', timestamp: Date.now(),
    text: 'Opening browser for login...',
  })

  child.on('close', (code) => {
    const success = code === 0
    sendMsg(senderWindow, sessionId, {
      id: nextMessageId(),
      type: success ? 'system' : 'error',
      timestamp: Date.now(),
      text: success
        ? 'Login successful. You can now send messages.'
        : `Login failed (exit ${String(code)}). ${output.trim()}`,
    })
    senderWindow.webContents.send(`agentSdk:done:${sessionId}`, '')
  })
}
