/**
 * IPC handlers for the Claude Agent SDK integration.
 * Uses the V1 query() API with `resume` for token-efficient multi-turn conversations.
 */
import { BrowserWindow, IpcMain } from 'electron'
import { HandlerContext } from './types'
import type { AgentSdkPermissionRequest } from '../../shared/agentSdkTypes'
import {
  expandHome, resolveAgentSdkCliPath,
  handleLoadHistory, handleStatus, handleFetchCommands, handleFetchModels, handleLogin,
  createFakeQuery, sendMockAgentResponse,
  readClaudeSettings, addAllowedTool, buildAllowEntry, isToolAllowed,
  type SdkModelInfo, type SdkQuery,
} from './agentSdkHelpers'
import { processAndSendMessage } from './agentSdkMessages'

interface PendingPermission {
  resolve: (result: { behavior: 'allow' } | { behavior: 'deny'; message: string }) => void
}

interface ActiveSession {
  query: SdkQuery | null
  sdkSessionId?: string
  ownerWindow: BrowserWindow
  pendingPermission: PendingPermission | null
  /** True after the first system init message has been forwarded to the renderer */
  initSent: boolean
  /** Working directory for this session — used to locate .claude/settings.local.json */
  cwd: string
}

const activeSessions = new Map<string, ActiveSession>()

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
      processAndSendMessage(sessionId, msg, win, activeSessions.get(sessionId))

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
    } else {
      console.error('[agentSdk] Stream error:', errorMessage)
      if (err instanceof Error && err.stack) console.error(err.stack)
      win.webContents.send(`agentSdk:error:${sessionId}`, errorMessage)
      activeSessions.delete(sessionId)
    }
  } finally {
    // Turn is done — clear the query reference so subsequent sends create a new query
    if (activeSessions.has(sessionId)) {
      activeSessions.get(sessionId)!.query = null
    }
    // If no result message was emitted (e.g. interrupted), still notify the renderer
    if (!resultSent && activeSessions.has(sessionId)) {
      const sdkSessionId = session.sdkSessionId ?? ''
      win.webContents.send(`agentSdk:done:${sessionId}`, sdkSessionId)
    }
  }
}

/**
 * Build the options object for a V1 query() call.
 */
async function buildQueryOptions(
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
): Promise<Record<string, unknown>> {
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

  // Pass permissionMode to the SDK so the CLI subprocess knows how to
  // categorize tools. Our canUseTool callback handles the actual approval
  // flow, but the CLI needs permissionMode to decide WHICH tools require
  // permission in the first place.
  queryOptions.permissionMode = mode
  if (mode === 'bypassPermissions') {
    queryOptions.allowDangerouslySkipPermissions = true
  }

  // Register canUseTool for ALL modes so the SDK always has a handler.
  // Without this, the SDK silently denies tools that need permission.
  queryOptions.canUseTool = async (
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
  const queryOptions = await buildQueryOptions(cwd, options, sessionId, win)
  console.log('[agentSdk] startTurn', sessionId, 'cwd:', cwd, 'resume:', options.sdkSessionId ?? 'none')

  // Ensure the session exists in activeSessions BEFORE creating the query.
  // The SDK starts processing messages (including canUseTool permission
  // requests) immediately in the Query constructor, so the session must be
  // in the map before sdkQuery() is called.
  let session = activeSessions.get(sessionId)
  if (!session) {
    session = {
      query: null,
      sdkSessionId: options.sdkSessionId,
      ownerWindow: win,
      pendingPermission: null,
      initSent: false,
      cwd,
    }
    activeSessions.set(sessionId, session)
  } else {
    session.ownerWindow = win
  }

  let q: SdkQuery
  if (process.env.E2E_FAKE_SDK === 'true') {
    q = createFakeQuery({ prompt, options: queryOptions })
  } else {
    const { query: sdkQuery } = await import('@anthropic-ai/claude-agent-sdk')
    q = sdkQuery({ prompt, options: queryOptions }) as unknown as SdkQuery
  }

  session.query = q

  try {
    await runTurn(sessionId, session, win)
  } catch (err: unknown) {
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
    // E2E_REAL_SDK=true bypasses the mock so we can test the real SDK in E2E
    if (ctx.isE2ETest && process.env.E2E_FAKE_SDK !== 'true' && process.env.E2E_REAL_SDK !== 'true') {
      const senderWindow = BrowserWindow.fromWebContents(_event.sender)
      if (!senderWindow) return { id: options.id }
      sendMockAgentResponse(senderWindow, options.id, options.prompt, activeSessions)
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
    if (ctx.isE2ETest && process.env.E2E_FAKE_SDK !== 'true' && process.env.E2E_REAL_SDK !== 'true') {
      const senderWindow = BrowserWindow.fromWebContents(_event.sender)
      if (senderWindow) sendMockAgentResponse(senderWindow, id, prompt, activeSessions)
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

  // eslint-disable-next-line max-params -- IPC positional args; can't restructure without breaking the preload API
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
          void addAllowedTool(session.cwd, entry).catch((err: unknown) => {
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

  ipcMain.handle('agentSdk:commands', async (_event, cwd?: string, agentEnv?: Record<string, string>) => {
    return handleFetchCommands(cwd, agentEnv)
  })

  ipcMain.handle('agentSdk:models', async (_event, agentEnv?: Record<string, string>): Promise<SdkModelInfo[]> => {
    if (ctx.isE2ETest) return []
    return handleFetchModels(agentEnv)
  })
}
