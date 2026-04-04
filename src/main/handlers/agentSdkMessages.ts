/**
 * SDK message processing — transforms raw SDK messages into AgentSdkMessage
 * objects and forwards them to the renderer.
 */
import { BrowserWindow } from 'electron'
import { nextMessageId, sendMsg } from './agentSdkHelpers'

export interface SessionState {
  sdkSessionId?: string
  initSent: boolean
}

function processSystemMessage(
  sessionId: string,
  sdkMessage: Record<string, unknown>,
  win: BrowserWindow,
  session: SessionState | undefined,
): void {
  if (session && typeof sdkMessage.session_id === 'string') {
    session.sdkSessionId = sdkMessage.session_id
  }
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
  const costUsd = (sdkMessage.cost_usd ?? sdkMessage.total_cost_usd) as number | undefined
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

export function processAndSendMessage(
  sessionId: string,
  sdkMessage: Record<string, unknown>,
  win: BrowserWindow,
  session: SessionState | undefined,
): void {
  const type = sdkMessage.type as string
  if (type === 'system' && sdkMessage.subtype === 'init') {
    processSystemMessage(sessionId, sdkMessage, win, session)
  } else if (type === 'assistant') {
    processAssistantMessage(sessionId, sdkMessage, win)
  } else if (type === 'user') {
    processUserMessage(sessionId, sdkMessage, win)
  } else if (type === 'result') {
    processResultMessage(sessionId, sdkMessage, win)
  }
}
