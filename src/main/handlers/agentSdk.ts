/**
 * IPC handlers for the Claude Agent SDK integration.
 *
 * Uses the V2 Session API for multi-turn conversations.
 * A single persistent session handles all turns — no restarts, no replayed
 * history, token-efficient by design.
 *
 * Pattern:
 *   createSession() or resumeSession() → session.send() → session.stream()
 *   Follow-up turns reuse the same session object via send()/stream().
 */
import { BrowserWindow, IpcMain } from 'electron'
import { HandlerContext } from './types'
import type { AgentSdkMessage, AgentSdkPermissionRequest } from '../../shared/agentSdkTypes'
import {
  expandHome, nextMessageId, sendMsg, resolveAgentSdkCliPath,
  handleLoadHistory, handleStatus, handleFetchCommands, handleFetchModels, handleLogin,
  type SdkModelInfo,
} from './agentSdkHelpers'

// ── .claude/settings.local.json helpers ──
// Mirrors the Claude Code CLI's permission format:
//   Bash(command_prefix)  — allows bash commands starting with that prefix
//   Edit                  — allows all file edits
//   Read                  — allows all file reads
//   ToolName              — allows a specific tool unconditionally

import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const SETTINGS_FILE = '.claude/settings.local.json'

interface ClaudeSettings {
  permissions?: { allow?: string[] }
  [key: string]: unknown
}

async function readClaudeSettings(cwd: string): Promise<ClaudeSettings> {
  try {
    const raw = await readFile(join(cwd, SETTINGS_FILE), 'utf-8')
    return JSON.parse(raw) as ClaudeSettings
  } catch {
    return {}
  }
}

async function writeClaudeSettings(cwd: string, settings: ClaudeSettings): Promise<void> {
  const dir = join(cwd, '.claude')
  await mkdir(dir, { recursive: true })
  await writeFile(join(cwd, SETTINGS_FILE), JSON.stringify(settings, null, 2) + '\n', 'utf-8')
}

async function addAllowedTool(cwd: string, entry: string): Promise<void> {
  const settings = await readClaudeSettings(cwd)
  if (!settings.permissions) settings.permissions = {}
  if (!settings.permissions.allow) settings.permissions.allow = []
  if (!settings.permissions.allow.includes(entry)) {
    settings.permissions.allow.push(entry)
    await writeClaudeSettings(cwd, settings)
  }
}

/**
 * Build the "always allow" entry string for a given tool + input.
 * Follows Claude Code CLI conventions.
 */
function buildAllowEntry(toolName: string, toolInput: Record<string, unknown>): string {
  if (toolName === 'Bash') {
    // Extract the command prefix (first word/executable)
    const command = typeof toolInput.command === 'string' ? toolInput.command : ''
    const prefix = command.split(/\s+/)[0] ?? ''
    return prefix ? `Bash(${prefix})` : 'Bash'
  }
  // For Edit, Write, Read, and other tools — just the tool name
  return toolName
}

/**
 * Check whether a tool + input is covered by the allowed tools list.
 */
function isToolAllowed(allowedTools: string[], toolName: string, toolInput: Record<string, unknown>): boolean {
  for (const entry of allowedTools) {
    // Exact tool name match (e.g. "Edit", "Read")
    if (entry === toolName) return true

    // Bash(prefix) match
    const bashMatch = entry.match(/^Bash\((.+)\)$/)
    if (bashMatch && toolName === 'Bash') {
      const prefix = bashMatch[1]
      const command = typeof toolInput.command === 'string' ? toolInput.command : ''
      if (command === prefix || command.startsWith(prefix + ' ')) return true
    }
  }
  return false
}

interface PendingPermission {
  resolve: (result: { behavior: 'allow' } | { behavior: 'deny'; message: string }) => void
}

interface InjectPayload {
  type: 'user'
  message: { role: 'user'; content: { type: 'text'; text: string }[] }
  parent_tool_use_id: null
  priority: 'next'
  session_id: string
}

interface ActiveSession {
  sdkSession: {
    send(message: string | InjectPayload): Promise<void>
    stream(): AsyncGenerator<unknown, void>
    close(): void
    readonly sessionId: string
  }
  sdkSessionId?: string
  ownerWindow: BrowserWindow
  pendingPermission: PendingPermission | null
  /** True after the first system init message has been forwarded to the renderer */
  initSent: boolean
  /** Working directory for this session — used to locate .claude/settings.local.json */
  cwd: string
}

// Module-local state
const activeSessions = new Map<string, ActiveSession>()


function processSystemMessage(sessionId: string, sdkMessage: Record<string, unknown>, win: BrowserWindow): void {
  const session = activeSessions.get(sessionId)
  if (session && typeof sdkMessage.session_id === 'string') {
    session.sdkSessionId = sdkMessage.session_id
  }
  // The SDK emits a system init on every stream() call (each turn).
  // Only forward the first one to the renderer to avoid "Session initialized"
  // appearing before every response.
  if (session?.initSent) return
  if (session) session.initSent = true

  const model = typeof sdkMessage.model === 'string' ? sdkMessage.model : 'unknown'
  sendMsg(win, sessionId, {
    id: nextMessageId(),
    type: 'system',
    timestamp: Date.now(),
    text: `Session initialized (model: ${model})`,
  })
}

function processAssistantMessage(sessionId: string, sdkMessage: Record<string, unknown>, win: BrowserWindow): void {
  const message = sdkMessage.message as Record<string, unknown> | undefined
  if (!message) return
  const content = message.content as Record<string, unknown>[] | undefined
  if (!content) return
  const parentId = (sdkMessage.parent_tool_use_id as string | null) ?? null

  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      sendMsg(win, sessionId, {
        id: nextMessageId(),
        type: 'text',
        timestamp: Date.now(),
        text: block.text,
        parentToolUseId: parentId,
      })
    } else if (block.type === 'tool_use') {
      sendMsg(win, sessionId, {
        id: nextMessageId(),
        type: 'tool_use',
        timestamp: Date.now(),
        toolName: block.name as string,
        toolInput: block.input as Record<string, unknown>,
        toolUseId: block.id as string,
        parentToolUseId: parentId,
      })
    }
  }
}

function processUserMessage(sessionId: string, sdkMessage: Record<string, unknown>, win: BrowserWindow): void {
  const message = sdkMessage.message as Record<string, unknown> | undefined
  if (!message) return
  const content = message.content as Record<string, unknown>[] | undefined
  if (!content) return
  const parentId = (sdkMessage.parent_tool_use_id as string | null) ?? null

  for (const block of content) {
    if (block.type !== 'tool_result') continue
    const resultContent = block.content as string | Record<string, unknown>[] | undefined
    let resultText = ''
    if (typeof resultContent === 'string') {
      resultText = resultContent
    } else if (Array.isArray(resultContent)) {
      resultText = resultContent
        .filter((c) => c.type === 'text')
        .map((c) => c.text as string)
        .join('\n')
    }
    if (resultText.length > 5000) {
      resultText = `${resultText.slice(0, 5000)}\n... (truncated)`
    }
    sendMsg(win, sessionId, {
      id: nextMessageId(),
      type: 'tool_result',
      timestamp: Date.now(),
      toolUseId: block.tool_use_id as string,
      toolResult: resultText,
      isError: (block.is_error as boolean | undefined) === true,
      parentToolUseId: parentId,
    })
  }
}

function processResultMessage(sessionId: string, sdkMessage: Record<string, unknown>, win: BrowserWindow): void {
  sendMsg(win, sessionId, {
    id: nextMessageId(),
    type: 'result',
    timestamp: Date.now(),
    result: typeof sdkMessage.result === 'string' ? sdkMessage.result : undefined,
    costUsd: sdkMessage.total_cost_usd as number | undefined,
    durationMs: sdkMessage.duration_ms as number | undefined,
    numTurns: sdkMessage.num_turns as number | undefined,
  })
}

function processAndSendMessage(
  sessionId: string,
  sdkMessage: Record<string, unknown>,
  win: BrowserWindow,
): void {
  const type = sdkMessage.type as string

  if (type === 'system' && sdkMessage.subtype === 'init') {
    processSystemMessage(sessionId, sdkMessage, win)
  } else if (type === 'assistant') {
    processAssistantMessage(sessionId, sdkMessage, win)
  } else if (type === 'user') {
    processUserMessage(sessionId, sdkMessage, win)
  } else if (type === 'result') {
    processResultMessage(sessionId, sdkMessage, win)
  }
}

/**
 * Run a single turn: stream all messages until the turn completes.
 * In V2, each send()/stream() pair is one turn. The stream iterator
 * finishes when the turn is done.
 */
async function streamTurn(
  sessionId: string,
  session: ActiveSession,
  win: BrowserWindow,
): Promise<void> {
  try {
    for await (const message of session.sdkSession.stream()) {
      if (!activeSessions.has(sessionId)) break
      const msg = message as Record<string, unknown>
      processAndSendMessage(sessionId, msg, win)

      if (msg.type === 'result') {
        const sdkSessionId = session.sdkSessionId ?? ''
        win.webContents.send(`agentSdk:done:${sessionId}`, sdkSessionId)
      }
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    if (errorMessage.includes('aborted')) {
      // User cancelled — not an error
    } else {
      console.error('[agentSdk] Stream error:', errorMessage)
      if (err instanceof Error && err.stack) console.error(err.stack)
      win.webContents.send(`agentSdk:error:${sessionId}`, errorMessage)
      // On error, clean up so next message starts a fresh session
      activeSessions.delete(sessionId)
    }
  }
}

/**
 * Create a V2 SDK session and start the stream loop.
 */
async function startSession(
  sessionId: string,
  firstPrompt: string,
  cwd: string,
  win: BrowserWindow,
  options: {
    sdkSessionId?: string
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk'
    env?: Record<string, string>
    model?: string
    effort?: 'low' | 'medium' | 'high' | 'max'
  },
): Promise<void> {
  const cliPath = resolveAgentSdkCliPath()
  console.log('[agentSdk] startSession (V2)', sessionId, 'cwd:', cwd, 'permissionMode:', options.permissionMode ?? 'default')
  const {
    unstable_v2_createSession,
    unstable_v2_resumeSession,
  } = await import('@anthropic-ai/claude-agent-sdk')

  // Build env: process.env as base, agent-specific env vars merged on top
  const agentEnv: Record<string, string> = {}
  if (options.env) {
    for (const [key, value] of Object.entries(options.env)) {
      agentEnv[key] = expandHome(value)
    }
  }
  const env = { ...process.env, ...agentEnv }

  // Build session options — cwd is passed as an extra property.
  // The V2 types don't declare it yet (unstable), but the underlying
  // engine respects it (same as V1 Options.cwd).
  const sessionOptions: Record<string, unknown> = {
    model: options.model ?? 'default',
    pathToClaudeCodeExecutable: cliPath,
    cwd,
    env,
  }
  if (options.effort) {
    sessionOptions.effort = options.effort
  }

  const mode = options.permissionMode ?? 'default'
  // Do NOT pass permissionMode or allowDangerouslySkipPermissions to the SDK.
  // Those configure the CLI subprocess's internal permission system, which
  // handles permissions itself and never routes protected-path rejections
  // (e.g. .claude/ edits) through canUseTool. Instead, we omit them so the
  // CLI always defers to our canUseTool callback via --permission-prompt-tool stdio.

  // Edit-like tool names that acceptEdits mode auto-allows
  const EDIT_TOOLS = new Set(['Edit', 'FileEdit', 'Write', 'FileWrite', 'NotebookEdit'])

  // Helper: send a permission request to the renderer and wait for user response
  const promptUser = (
    toolName: string,
    input: Record<string, unknown>,
    decisionReason?: string,
  ): Promise<{ behavior: 'allow' } | { behavior: 'deny'; message: string }> => {
    const permReq: AgentSdkPermissionRequest = {
      id: `perm-${String(Date.now())}`,
      toolName,
      toolInput: input,
      toolUseId: `tooluse-${String(Date.now())}`,
      decisionReason,
    }
    win.webContents.send(`agentSdk:permission:${sessionId}`, permReq)

    return new Promise<{ behavior: 'allow' } | { behavior: 'deny'; message: string }>((resolve) => {
      const activeSession = activeSessions.get(sessionId)
      if (activeSession) {
        activeSession.pendingPermission = { resolve }
      }
    })
  }

  // Load the project's allowed tools list (from .claude/settings.local.json)
  let allowedTools: string[] = []
  try {
    const settings = await readClaudeSettings(cwd)
    allowedTools = settings.permissions?.allow ?? []
  } catch {
    // No settings file — everything needs permission
  }

  // Register canUseTool for ALL modes so the SDK always has a handler.
  // Without this, the SDK silently denies tools that need permission.
  sessionOptions.canUseTool = async (
    toolName: string,
    input: Record<string, unknown>,
    canUseToolOptions: { signal: AbortSignal; decisionReason?: string },
  ) => {
    // Check the project's allowed tools list before prompting
    if (isToolAllowed(allowedTools, toolName, input)) {
      return { behavior: 'allow' as const }
    }

    switch (mode) {
      case 'bypassPermissions':
        // Auto-allow everything — the SDK flag handles most cases, but
        // some protected operations (e.g. editing .claude/) still call
        // canUseTool even with allowDangerouslySkipPermissions.
        return { behavior: 'allow' as const }

      case 'acceptEdits':
        // Auto-allow edit tools; prompt for everything else
        if (EDIT_TOOLS.has(toolName)) {
          return { behavior: 'allow' as const }
        }
        return promptUser(toolName, input, canUseToolOptions.decisionReason)

      case 'plan':
        // Only allow ExitPlanMode; prompt for that, deny others
        if (toolName === 'ExitPlanMode') {
          return promptUser(toolName, input, canUseToolOptions.decisionReason)
        }
        return { behavior: 'deny' as const, message: 'Only plan tools are allowed in plan mode' }

      case 'dontAsk':
        // Auto-deny everything that needs permission
        return { behavior: 'deny' as const, message: 'Permission not granted (dontAsk mode)' }

      case 'default':
      default:
        // Prompt the user for every tool
        return promptUser(toolName, input, canUseToolOptions.decisionReason)
    }
  }

  // WORKAROUND: The V2 SDKSessionOptions type doesn't include `cwd`, and the
  // SDK's SDKSession class doesn't forward it to the ProcessTransport. The
  // subprocess inherits process.cwd() from the parent. Since createSession()
  // and resumeSession() are synchronous (spawn the subprocess immediately in
  // the constructor), we temporarily chdir so the subprocess picks up the
  // correct directory.
  const originalCwd = process.cwd()
  try {
    process.chdir(cwd)
  } catch (err) {
    console.warn('[agentSdk] Failed to chdir to', cwd, err)
  }

  let sdkSession
  if (options.sdkSessionId && options.sdkSessionId.length > 0) {
    // Resume existing session — restores conversation context across app restarts
    console.log('[agentSdk] Resuming session:', options.sdkSessionId)
    sdkSession = unstable_v2_resumeSession(
      options.sdkSessionId,
      sessionOptions as Parameters<typeof unstable_v2_resumeSession>[1],
    )
  } else {
    sdkSession = unstable_v2_createSession(
      sessionOptions as Parameters<typeof unstable_v2_createSession>[0],
    )
  }

  try {
    process.chdir(originalCwd)
  } catch {
    // Best-effort restore
  }

  const session: ActiveSession = {
    sdkSession: sdkSession as ActiveSession['sdkSession'],
    sdkSessionId: options.sdkSessionId,
    ownerWindow: win,
    pendingPermission: null,
    initSent: false,
    cwd,
  }
  activeSessions.set(sessionId, session)

  // V2 pattern: send() then stream() for each turn
  try {
    console.log('[agentSdk] Sending first prompt...')
    await sdkSession.send(firstPrompt)
    console.log('[agentSdk] First prompt sent, starting stream...')
    await streamTurn(sessionId, session, win)
    console.log('[agentSdk] First turn stream completed')
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error('[agentSdk] startSession error:', errorMessage)
    if (err instanceof Error && err.stack) console.error(err.stack)
    win.webContents.send(`agentSdk:error:${sessionId}`, errorMessage)
    activeSessions.delete(sessionId)
  }
}

/**
 * Resolve the mock response text for a given prompt.
 *
 * Reads E2E_AGENT_RESPONSES (JSON array of {match, response} objects) and
 * returns the text of the first entry whose `match` string appears in the
 * prompt. Falls back to a generic placeholder when nothing matches.
 */
function resolveMockResponseText(prompt: string): string {
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

/** Tracks which mock sessions have already received their system init message. */
const mockInitSent = new Set<string>()

interface MockToolUse {
  toolName: string
  toolInput: Record<string, unknown>
  decisionReason?: string
}

/**
 * Resolve mock tool uses for a given prompt.
 *
 * Reads E2E_AGENT_TOOL_USES (JSON array of {match, tools} objects) and
 * returns the tool list of the first entry whose `match` string appears in
 * the prompt. Returns an empty array when nothing matches.
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

/**
 * Send a canned mock agent response sequence for E2E tests.
 * Fires system init (first turn only), optional tool_use messages that
 * trigger permission prompts, a text reply, and a result/done.
 * When E2E_AGENT_RESPONSE_DELAY_MS is set, the response is deferred by
 * that many milliseconds so tests can inject mid-turn messages.
 */
function sendMockAgentResponse(win: BrowserWindow, sessionId: string, prompt: string): void {
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
    // Emit mock tool_use messages that require permission approval
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

      // Send permission request and wait for user response
      const permReq: AgentSdkPermissionRequest = {
        id: `perm-${String(Date.now())}`,
        toolName: tool.toolName,
        toolInput: tool.toolInput,
        toolUseId,
        decisionReason: tool.decisionReason,
      }
      win.webContents.send(`agentSdk:permission:${sessionId}`, permReq)

      // Wait for the user to respond to the permission request
      const allowed = await new Promise<boolean>((resolve) => {
        // Store in activeSessions so the agentSdk:respond handler can resolve it
        let session = activeSessions.get(sessionId)
        if (!session) {
          // Create a lightweight mock session entry
          session = {
            sdkSession: { send: async () => {}, stream: async function* () {}, close: () => {}, sessionId: 'mock-session-id' },
            ownerWindow: win,
            pendingPermission: null,
            initSent: true,
            cwd: process.cwd(),
          }
          activeSessions.set(sessionId, session)
        }
        session.pendingPermission = {
          resolve: (result) => resolve(result.behavior === 'allow'),
        }
      })

      // Send tool_result based on permission response
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
        // If denied, skip remaining tools and finish with an error result
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

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('agentSdk:start', (_event, options: {
    id: string
    prompt: string
    cwd: string
    sdkSessionId?: string
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk'
    env?: Record<string, string>
    model?: string
    effort?: 'low' | 'medium' | 'high' | 'max'
  }) => {
    if (ctx.isE2ETest) {
      const senderWindow = BrowserWindow.fromWebContents(_event.sender)
      if (!senderWindow) return { id: options.id }
      sendMockAgentResponse(senderWindow, options.id, options.prompt)
      return { id: options.id }
    }

    const senderWindow = BrowserWindow.fromWebContents(_event.sender)
    if (!senderWindow) return { id: options.id }

    // Kill any existing session with the same ID
    const existing = activeSessions.get(options.id)
    if (existing) {
      existing.sdkSession.close()
      activeSessions.delete(options.id)
    }

    void startSession(options.id, options.prompt, options.cwd, senderWindow, {
      sdkSessionId: options.sdkSessionId,
      permissionMode: options.permissionMode,
      env: options.env,
      model: options.model,
      effort: options.effort,
    })

    return { id: options.id }
  })

  // Send a follow-up message to an existing session.
  // If no session exists, starts a new one.
  ipcMain.handle('agentSdk:send', async (_event, id: string, prompt: string, options?: {
    sdkSessionId?: string; cwd?: string; permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk'; env?: Record<string, string>; model?: string; effort?: 'low' | 'medium' | 'high' | 'max'
  }) => {
    if (ctx.isE2ETest) {
      const senderWindow = BrowserWindow.fromWebContents(_event.sender)
      if (senderWindow) sendMockAgentResponse(senderWindow, id, prompt)
      return
    }

    const existing = activeSessions.get(id)
    if (existing) {
      // Session is alive — send then stream this turn (token-efficient, no restart)
      console.log('[agentSdk] send: using existing V2 session for', id)
      try {
        await existing.sdkSession.send(prompt)
        await streamTurn(id, existing, existing.ownerWindow)
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        console.error('[agentSdk] send error:', errorMessage)
        existing.ownerWindow.webContents.send(`agentSdk:error:${id}`, errorMessage)
        activeSessions.delete(id)
      }
      return
    }

    // No active session — start a new one
    const senderWindow = BrowserWindow.fromWebContents(_event.sender)
    if (!senderWindow) return

    const cwd = options?.cwd ?? process.cwd()
    console.log('[agentSdk] send: no active session, starting new. cwd:', cwd)
    void startSession(id, prompt, cwd, senderWindow, {
      sdkSessionId: options?.sdkSessionId,
      permissionMode: options?.permissionMode,
      env: options?.env,
      model: options?.model,
      effort: options?.effort,
    })
  })

  ipcMain.handle('agentSdk:stop', (_event, id: string) => {
    const session = activeSessions.get(id)
    if (session) {
      session.sdkSession.close()
      activeSessions.delete(id)
    }
  })

  // Inject a message mid-turn with priority 'next'. The stream for the current
  // turn is already running — we just enqueue the message; no new stream needed.
  ipcMain.handle('agentSdk:inject', async (_event, id: string, prompt: string) => {
    const session = activeSessions.get(id)
    if (!session) {
      console.warn('[agentSdk] inject: no active session for', id)
      return
    }
    if (!session.sdkSessionId) {
      console.warn('[agentSdk] inject: sdkSessionId not yet known for', id)
      return
    }
    console.log('[agentSdk] inject: queuing mid-turn message for', id)
    try {
      await session.sdkSession.send({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: prompt }] },
        parent_tool_use_id: null,
        priority: 'next',
        session_id: session.sdkSessionId,
      })
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[agentSdk] inject error:', errorMessage)
      session.ownerWindow.webContents.send(`agentSdk:error:${id}`, errorMessage)
    }
  })

  ipcMain.handle('agentSdk:respond', (_event, id: string, _toolUseId: string, allowed: boolean, updatedInput?: Record<string, unknown>, alwaysAllow?: { toolName: string; toolInput: Record<string, unknown> }) => {
    const session = activeSessions.get(id)
    if (session?.pendingPermission) {
      if (allowed) {
        session.pendingPermission.resolve({
          behavior: 'allow',
          ...(updatedInput ? { updatedInput } : {}),
        })
        // Persist "Always Allow" to .claude/settings.local.json
        if (alwaysAllow && session.cwd) {
          const entry = buildAllowEntry(alwaysAllow.toolName, alwaysAllow.toolInput)
          void addAllowedTool(session.cwd, entry).catch((err) => {
            console.warn('[agentSdk] Failed to save always-allow entry:', err)
          })
        }
      } else {
        session.pendingPermission.resolve({ behavior: 'deny', message: 'User denied permission' })
      }
      session.pendingPermission = null
    }
  })

  ipcMain.handle('agentSdk:loadHistory', async (_event, sdkSessionId: string, sessionId: string, agentEnv?: Record<string, string>, limit?: number) => {
    if (ctx.isE2ETest || !sdkSessionId || sdkSessionId.length === 0) return
    const senderWindow = BrowserWindow.fromWebContents(_event.sender)
    if (!senderWindow) return
    try {
      await handleLoadHistory(senderWindow, sdkSessionId, sessionId, agentEnv, limit)
    } catch (err) {
      console.warn('[agentSdk] Failed to load history:', err instanceof Error ? err.message : err)
    }
  })

  ipcMain.handle('agentSdk:login', (_event, sessionId: string) => {
    const senderWindow = BrowserWindow.fromWebContents(_event.sender)
    if (!senderWindow) return
    handleLogin(senderWindow, sessionId)
  })

  ipcMain.handle('agentSdk:status', async (_event, sessionId: string, agentEnv?: Record<string, string>) => {
    const senderWindow = BrowserWindow.fromWebContents(_event.sender)
    if (!senderWindow) return
    const session = activeSessions.get(sessionId)
    await handleStatus(senderWindow, sessionId, session?.sdkSessionId, agentEnv)
  })

  ipcMain.handle('agentSdk:commands', async (_event, agentEnv?: Record<string, string>) => {
    return handleFetchCommands(agentEnv)
  })

  ipcMain.handle('agentSdk:models', async (_event, agentEnv?: Record<string, string>): Promise<SdkModelInfo[]> => {
    if (ctx.isE2ETest) return []
    return handleFetchModels(agentEnv)
  })
}
