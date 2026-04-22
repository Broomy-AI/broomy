/**
 * IPC handlers for the Claude Agent SDK integration.
 * Uses the V1 query() API with `resume` for token-efficient multi-turn conversations.
 */
import { BrowserWindow, IpcMain } from 'electron'
import { HandlerContext } from './types'
import type { AgentSdkPermissionRequest } from '../../shared/agentSdkTypes'
import {
  expandHome, nextMessageId, sendMsg, resolveAgentSdkCliPath,
  handleLoadHistory, handleStatus, handleFetchCommands, handleFetchModels, handleLogin,
  createFakeQuery, sendMockAgentResponse, isSessionNotFoundError,
  type SdkModelInfo, type SdkQuery,
} from './agentSdkHelpers'

interface PendingPermission {
  resolve: (result: { behavior: 'allow' } | { behavior: 'deny'; message: string }) => void
}

/**
 * Thrown when a resume attempt fails because the SDK session no longer exists.
 * Caught by startTurn to retry without resume, rather than surfacing the error
 * to the renderer — which would leave the user stuck in a loop.
 */
class ResumeFailedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResumeFailedError'
  }
}

interface ActiveSession {
  query: SdkQuery | null
  sdkSessionId?: string
  ownerWindow: BrowserWindow
  pendingPermission: PendingPermission | null
  /** True after the first system init message has been forwarded to the renderer */
  initSent: boolean
}

const activeSessions = new Map<string, ActiveSession>()

function processSystemMessage(sessionId: string, sdkMessage: Record<string, unknown>, win: BrowserWindow): void {
  const session = activeSessions.get(sessionId)
  if (session && typeof sdkMessage.session_id === 'string') {
    session.sdkSessionId = sdkMessage.session_id
  }
  // Only forward the first system init to the renderer to avoid
  // "Session initialized" appearing before every response.
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
  // V1 uses cost_usd; V2 used total_cost_usd — handle both for safety
  const costUsd = (sdkMessage.cost_usd ?? sdkMessage.total_cost_usd) as number | undefined

  // Handle error results (subtype: error_during_execution, error_max_turns, etc.)
  const subtype = sdkMessage.subtype as string | undefined
  if (subtype?.startsWith('error')) {
    const errors = sdkMessage.errors as { message?: string }[] | undefined
    const errorText = errors?.map((e) => e.message ?? 'unknown error').join('\n') ?? `Agent error: ${subtype}`
    sendMsg(win, sessionId, {
      id: nextMessageId(),
      type: 'error',
      timestamp: Date.now(),
      text: errorText,
    })
  }

  sendMsg(win, sessionId, {
    id: nextMessageId(),
    type: 'result',
    timestamp: Date.now(),
    result: typeof sdkMessage.result === 'string' ? sdkMessage.result : undefined,
    costUsd,
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
 * Iterate a running query, forwarding messages to the renderer.
 * When the generator completes the turn is done.
 */
async function runTurn(
  sessionId: string,
  session: ActiveSession,
  win: BrowserWindow,
): Promise<void> {
  const q = session.query
  if (!q) return
  let resultSent = false
  try {
    for await (const message of q) {
      if (!activeSessions.has(sessionId)) break
      const msg = message
      processAndSendMessage(sessionId, msg, win)

      if (msg.type === 'result') {
        resultSent = true
        // Capture session_id from result as well
        if (typeof msg.session_id === 'string') {
          session.sdkSessionId = msg.session_id
        }
        const sdkSessionId = session.sdkSessionId ?? ''
        win.webContents.send(`agentSdk:done:${sessionId}`, sdkSessionId)
      }
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    if (errorMessage.includes('aborted')) {
      // User cancelled — not an error
    } else if (session.sdkSessionId && isSessionNotFoundError(errorMessage)) {
      // Resume failed because the SDK session no longer exists — let startTurn
      // retry without resume rather than sending an error to the renderer.
      console.warn('[agentSdk] Session not found for resume:', session.sdkSessionId)
      activeSessions.delete(sessionId)
      throw new ResumeFailedError(errorMessage)
    } else {
      console.error('[agentSdk] Stream error:', errorMessage)
      if (err instanceof Error && err.stack) console.error(err.stack)
      win.webContents.send(`agentSdk:error:${sessionId}`, errorMessage)
      activeSessions.delete(sessionId)
    }
  } finally {
    // Turn is done — clear the query reference so subsequent sends create a new query.
    // Only touch the session if our query is still the active one; another startTurn
    // may have replaced it with a newer query.
    const current = activeSessions.get(sessionId)
    const isStillActive = current?.query === q
    if (current && isStillActive) {
      current.query = null
    }
    // If no result message was emitted (e.g. interrupted), still notify the renderer —
    // but only if our query wasn't superseded, to avoid a spurious done/idle flash.
    if (!resultSent && isStillActive && activeSessions.has(sessionId)) {
      const sdkSessionId = session.sdkSessionId ?? ''
      win.webContents.send(`agentSdk:done:${sessionId}`, sdkSessionId)
    }
  }
}

/**
 * Build the options object for a V1 query() call.
 */
function buildQueryOptions(
  cwd: string,
  options: {
    sdkSessionId?: string
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk'
    env?: Record<string, string>
    model?: string
    effort?: 'low' | 'medium' | 'high' | 'max'
  },
  sessionId: string,
  win: BrowserWindow,
): Record<string, unknown> {
  const cliPath = resolveAgentSdkCliPath()

  const agentEnv: Record<string, string> = {}
  if (options.env) {
    for (const [key, value] of Object.entries(options.env)) {
      agentEnv[key] = expandHome(value)
    }
  }
  const env = { ...process.env, ...agentEnv }

  const queryOptions: Record<string, unknown> = {
    pathToClaudeCodeExecutable: cliPath,
    model: options.model ?? 'default',
    cwd,
    env,
    tools: { type: 'preset', preset: 'claude_code' },
    settingSources: ['user', 'project'],
  }

  if (options.effort) {
    queryOptions.effort = options.effort
  }

  // Resume from existing session — token-efficient, no history replay
  if (options.sdkSessionId && options.sdkSessionId.length > 0) {
    queryOptions.resume = options.sdkSessionId
  }

  const mode = options.permissionMode ?? 'default'
  queryOptions.permissionMode = mode
  if (mode === 'bypassPermissions') {
    queryOptions.allowDangerouslySkipPermissions = true
  } else if (mode === 'default') {
    queryOptions.canUseTool = async (
      toolName: string,
      input: Record<string, unknown>,
      canUseToolOptions: { signal: AbortSignal; decisionReason?: string },
    ) => {
      const permReq: AgentSdkPermissionRequest = {
        id: `perm-${String(Date.now())}`,
        toolName,
        toolInput: input,
        toolUseId: `tooluse-${String(Date.now())}`,
        decisionReason: canUseToolOptions.decisionReason,
      }
      win.webContents.send(`agentSdk:permission:${sessionId}`, permReq)

      return new Promise<{ behavior: 'allow' } | { behavior: 'deny'; message: string }>((resolve) => {
        const activeSession = activeSessions.get(sessionId)
        if (activeSession) {
          activeSession.pendingPermission = { resolve }
        }
      })
    }
  }

  return queryOptions
}

/**
 * Start a turn: create a V1 query() and iterate its messages.
 * In fake-SDK mode (E2E_FAKE_SDK=true), uses createFakeQuery to validate
 * options without spawning a real subprocess.
 */
async function startTurn(
  sessionId: string,
  prompt: string,
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
  const queryOptions = buildQueryOptions(cwd, options, sessionId, win)
  console.log('[agentSdk] startTurn', sessionId, 'cwd:', cwd, 'resume:', options.sdkSessionId ?? 'none')

  let q: SdkQuery
  if (process.env.E2E_FAKE_SDK === 'true') {
    q = createFakeQuery({ prompt, options: queryOptions })
  } else {
    try {
      const { query: sdkQuery } = await import('@anthropic-ai/claude-agent-sdk')
      q = sdkQuery({ prompt, options: queryOptions }) as unknown as SdkQuery
    } catch (err: unknown) {
      // If query construction fails due to invalid session, retry without resume
      const msg = err instanceof Error ? err.message : String(err)
      if (options.sdkSessionId && isSessionNotFoundError(msg)) {
        console.warn('[agentSdk] Session not found at construction, retrying without resume')
        sendMsg(win, sessionId, {
          id: nextMessageId(),
          type: 'system',
          timestamp: Date.now(),
          text: 'Previous session expired — starting a new conversation.',
        })
        return startTurn(sessionId, prompt, cwd, win, { ...options, sdkSessionId: undefined })
      }
      throw err
    }
  }

  // Reuse existing session entry (preserves sdkSessionId & initSent) or create new
  let session = activeSessions.get(sessionId)
  if (session) {
    session.query = q
    session.ownerWindow = win
  } else {
    session = {
      query: q,
      sdkSessionId: options.sdkSessionId,
      ownerWindow: win,
      pendingPermission: null,
      initSent: false,
    }
    activeSessions.set(sessionId, session)
  }

  try {
    await runTurn(sessionId, session, win)
  } catch (err: unknown) {
    // If resume failed during iteration, retry the whole turn without resume
    if (err instanceof ResumeFailedError && options.sdkSessionId) {
      console.log('[agentSdk] Retrying without resume after session-not-found')
      sendMsg(win, sessionId, {
        id: nextMessageId(),
        type: 'system',
        timestamp: Date.now(),
        text: 'Previous session expired — starting a new conversation.',
      })
      return startTurn(sessionId, prompt, cwd, win, { ...options, sdkSessionId: undefined })
    }

    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error('[agentSdk] startTurn error:', errorMessage)
    if (err instanceof Error && err.stack) console.error(err.stack)
    win.webContents.send(`agentSdk:error:${sessionId}`, errorMessage)
    activeSessions.delete(sessionId)
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
    if (ctx.isE2ETest && process.env.E2E_FAKE_SDK !== 'true') {
      const senderWindow = BrowserWindow.fromWebContents(_event.sender)
      if (!senderWindow) return { id: options.id }
      sendMockAgentResponse(senderWindow, options.id, options.prompt)
      return { id: options.id }
    }

    const senderWindow = BrowserWindow.fromWebContents(_event.sender)
    if (!senderWindow) return { id: options.id }

    // Kill any existing query for this session
    const existing = activeSessions.get(options.id)
    if (existing?.query) {
      existing.query.close()
      existing.query = null
    }

    void startTurn(options.id, options.prompt, options.cwd, senderWindow, {
      sdkSessionId: options.sdkSessionId,
      permissionMode: options.permissionMode,
      env: options.env,
      model: options.model,
      effort: options.effort,
    })

    return { id: options.id }
  })

  // Send a follow-up message to an existing session.
  // Creates a new query() with resume to continue token-efficiently.
  ipcMain.handle('agentSdk:send', (_event, id: string, prompt: string, options?: {
    sdkSessionId?: string; cwd?: string; permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk'; env?: Record<string, string>; model?: string; effort?: 'low' | 'medium' | 'high' | 'max'
  }) => {
    if (ctx.isE2ETest && process.env.E2E_FAKE_SDK !== 'true') {
      const senderWindow = BrowserWindow.fromWebContents(_event.sender)
      if (senderWindow) sendMockAgentResponse(senderWindow, id, prompt)
      return
    }

    const existing = activeSessions.get(id)
    const senderWindow = existing?.ownerWindow ?? BrowserWindow.fromWebContents(_event.sender)
    if (!senderWindow) return

    // Determine the SDK session ID to resume from
    const sdkSessionId = existing?.sdkSessionId ?? options?.sdkSessionId
    const cwd = options?.cwd ?? process.cwd()

    if (sdkSessionId && sdkSessionId.length > 0) {
      console.log('[agentSdk] send: resuming session', sdkSessionId, 'for', id)
    } else {
      console.log('[agentSdk] send: no sdkSessionId, starting fresh. cwd:', cwd)
    }

    void startTurn(id, prompt, cwd, senderWindow, {
      sdkSessionId,
      permissionMode: options?.permissionMode,
      env: options?.env,
      model: options?.model,
      effort: options?.effort,
    })
  })

  ipcMain.handle('agentSdk:stop', (_event, id: string) => {
    const session = activeSessions.get(id)
    if (session?.query) {
      session.query.close()
      session.query = null
    }
    activeSessions.delete(id)
  })

  // Inject a message mid-turn using streamInput on the running query.
  ipcMain.handle('agentSdk:inject', async (_event, id: string, prompt: string) => {
    const session = activeSessions.get(id)
    if (!session?.query) {
      console.warn('[agentSdk] inject: no active query for', id)
      return
    }
    if (!session.sdkSessionId) {
      console.warn('[agentSdk] inject: sdkSessionId not yet known for', id)
      return
    }
    console.log('[agentSdk] inject: queuing mid-turn message for', id)
    try {
      const injectMsg = {
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: prompt }] },
        parent_tool_use_id: null,
        priority: 'next',
        session_id: session.sdkSessionId,
      }
      function* singleMessage(): Generator {
        yield injectMsg
      }
      await session.query.streamInput(singleMessage())
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[agentSdk] inject error:', errorMessage)
      session.ownerWindow.webContents.send(`agentSdk:error:${id}`, errorMessage)
    }
  })

  ipcMain.handle('agentSdk:respond', (_event, id: string, _toolUseId: string, allowed: boolean, updatedInput?: Record<string, unknown>) => {
    const session = activeSessions.get(id)
    if (session?.pendingPermission) {
      if (allowed) {
        session.pendingPermission.resolve({
          behavior: 'allow',
          ...(updatedInput ? { updatedInput } : {}),
        })
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
    // Let errors propagate to the renderer so it can preserve existing messages
    await handleLoadHistory(senderWindow, sdkSessionId, sessionId, agentEnv, limit)
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

  ipcMain.handle('agentSdk:commands', async (_event, cwd?: string, agentEnv?: Record<string, string>) => {
    return handleFetchCommands(cwd, agentEnv)
  })

  ipcMain.handle('agentSdk:models', async (_event, agentEnv?: Record<string, string>): Promise<SdkModelInfo[]> => {
    if (ctx.isE2ETest) return []
    return handleFetchModels(agentEnv)
  })
}
