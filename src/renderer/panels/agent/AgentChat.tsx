/**
 * Chat-based agent panel for API-mode (Agent SDK) sessions.
 *
 * Replaces the xterm Terminal for Claude sessions using the Agent SDK,
 * rendering structured messages instead of terminal output.
 */
import { useRef, useEffect, useCallback, memo, useState } from 'react'
import { useAgentChatStore } from '../../store/agentChat'
import { useSessionStore } from '../../store/sessions'
import { AgentChatMessage, ToolGroupBlock } from './AgentChatMessage'
import type { AgentSdkMessage } from '../../../shared/agentSdkTypes'
import { AgentChatInput } from './AgentChatInput'
import { PermissionRequest } from './AgentPermissionRequest'
import { useSdkModels, DEFAULT_MODEL } from '../../shared/hooks/useSdkModels'
import { formatElapsedTime } from '../../shared/utils/formatTime'
import { useElapsedSeconds } from '../../shared/hooks/useElapsedSeconds'
import { useAgentSdk } from './hooks/useAgentSdk'
import { useAutoScroll } from './hooks/useAutoScroll'

interface AgentChatProps {
  sessionId: string
  cwd: string
  sdkSessionId?: string
  skipApproval: boolean
  env?: Record<string, string>
  isRestored?: boolean
  model?: string
  effort?: 'low' | 'medium' | 'high' | 'max'
}

function EmptyState({ hasSdkSession }: { hasSdkSession: boolean }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center text-neutral-500">
        <p className="text-sm">
          {hasSdkSession
            ? 'Previous session will be resumed. Send a message to continue.'
            : 'Send a message to start working with Claude.'}
        </p>
        <p className="mt-2 text-xs text-neutral-600">
          Enter to send, Shift+Enter for newline
        </p>
      </div>
    </div>
  )
}

function agentStatusLabel(messages: AgentSdkMessage[], state: string): string {
  const lastToolUse = [...messages].reverse().find(m => m.type === 'tool_use')
  const hasResult = lastToolUse?.toolUseId
    ? messages.some(m => m.type === 'tool_result' && m.toolUseId === lastToolUse.toolUseId)
    : true
  if (lastToolUse && !hasResult) return `Waiting for tool: ${lastToolUse.toolName ?? 'unknown'}`
  if (state === 'awaiting_permission') return 'Awaiting permission...'
  return 'Working...'
}

function AgentChatInner({ sessionId, cwd, sdkSessionId, skipApproval, env, model: modelProp, effort: effortProp }: AgentChatProps) {
  const composerRef = useRef<HTMLTextAreaElement>(null)

  const [model, setModel] = useState(modelProp ?? DEFAULT_MODEL)
  const [effort, setEffort] = useState(effortProp ?? '')
  const [permissionMode, setPermissionMode] = useState<'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk'>(
    skipApproval ? 'bypassPermissions' : 'default'
  )
  const { models } = useSdkModels()

  const chatSession = useAgentChatStore((s) => s.getSession(sessionId))
  const { messages, state, pendingPermission } = chatSession
  const hasSdkSession = useSessionStore((s) => {
    const sess = s.sessions.find(ss => ss.id === sessionId)
    return !!(sess?.sdkSessionId && sess.sdkSessionId.length > 0)
  }) || !!(sdkSessionId && sdkSessionId.length > 0)

  const selectFile = useSessionStore((s) => s.selectFile)
  const handleOpenFile = useCallback((filePath: string) => {
    selectFile(sessionId, filePath)
  }, [sessionId, selectFile])

  const { sendPrompt, stopAgent, respondToPermission, availableCommands, historyMeta, loadFullHistory } = useAgentSdk({
    sessionId,
    cwd,
    sdkSessionId,
    permissionMode,
    env,
    model,
    effort: (effort || undefined) as 'low' | 'medium' | 'high' | 'max' | undefined,
  })

  const messageCount = messages.length
  const { messagesEndRef, scrollContainerRef, showScrollButton, handleScrollToBottom, handleScroll } = useAutoScroll(messageCount)

  // Capture plan file path when ExitPlanMode is detected
  useEffect(() => {
    if (messages.length === 0) return
    const lastMsg = messages[messages.length - 1]
    if (lastMsg.type === 'tool_use' && lastMsg.toolName === 'ExitPlanMode') {
      const input = lastMsg.toolInput
      if (input && typeof input.planFilePath === 'string') {
        useSessionStore.getState().setPlanFile(sessionId, input.planFilePath)
      }
    }
  }, [messageCount, sessionId])

  // Classify user vs assistant messages for styling
  // User messages are text messages that appear right before a system or assistant message
  const isUserMessage = useCallback((index: number) => {
    const id = messages[index]?.id ?? ''
    return id.startsWith('user-') || id.startsWith('history-user-')
  }, [messages])

  const isRunning = state === 'running' || state === 'awaiting_permission'
  const elapsedSeconds = useElapsedSeconds(sessionId)

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // Focus the composer when clicking in the chat area, unless the user
    // is clicking on an interactive element (button, link, select, etc.)
    // or has selected text (e.g. copying from the message stream).
    const selection = window.getSelection()
    if (selection && selection.toString().length > 0) return

    const tag = (e.target as HTMLElement).closest('button, a, select, textarea, input')
    if (!tag) {
      composerRef.current?.focus()
    }
  }, [])

  return (
    <div className="flex h-full flex-col bg-[#1a1a1a]" onClick={handleContainerClick}>
      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto px-4 py-3"
      >
        {messages.length === 0 && !isRunning && <EmptyState hasSdkSession={hasSdkSession} />}

        {/* Load earlier messages button */}
        {historyMeta && (
          <button
            onClick={loadFullHistory}
            className="mb-2 w-full rounded border border-neutral-700 bg-neutral-800/50 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-300"
          >
            Load {historyMeta.total - historyMeta.loaded} earlier messages
          </button>
        )}

        {(() => {
          // Tools that should always stand alone (not grouped)
          const STANDALONE = new Set(['ExitPlanMode', 'EnterPlanMode', 'AskUserQuestion', 'TodoWrite'])
          const EDITS = new Set(['Edit', 'FileEdit', 'Write', 'FileWrite'])

          const elements: React.ReactNode[] = []
          let i = 0
          while (i < messages.length) {
            const msg = messages[i]

            // Skip tool_result — rendered inside tool_use blocks
            if (msg.type === 'tool_result') { i++; continue }

            const canGroup = (n: string) => !STANDALONE.has(n) && !EDITS.has(n)
            const isGroupable = msg.type === 'tool_use' && canGroup(msg.toolName ?? '')

            if (isGroupable) {
              const group = []
              while (i < messages.length) {
                const m = messages[i]
                if (m.type === 'tool_result') { i++; continue }
                if (m.type === 'tool_use' && canGroup(m.toolName ?? '')) {
                  const result = m.toolUseId
                    ? messages.find(r => r.type === 'tool_result' && r.toolUseId === m.toolUseId)
                    : undefined
                  group.push({ msg: m, toolResult: result })
                  i++
                } else {
                  break
                }
              }
              if (group.length > 1) {
                elements.push(
                  <ToolGroupBlock key={group[0].msg.id} items={group} />
                )
              } else {
                elements.push(
                  <AgentChatMessage
                    key={group[0].msg.id} msg={group[0].msg}
                    toolResult={group[0].toolResult}
                    cwd={cwd} onOpenFile={handleOpenFile}
                  />
                )
              }
              continue
            }

            // Regular message (text, system, result, edit tools, standalone tools)
            const toolResult = msg.type === 'tool_use' && msg.toolUseId
              ? messages.find(m => m.type === 'tool_result' && m.toolUseId === msg.toolUseId)
              : undefined
            elements.push(
              <AgentChatMessage
                key={msg.id} msg={msg}
                isUserMessage={isUserMessage(i)} toolResult={toolResult}
                cwd={cwd} onOpenFile={handleOpenFile}
              />
            )
            i++
          }

          // Find the last ExitPlanMode and add approve action to it
          // (only if the agent isn't currently running)
          if (state !== 'running') {
            for (let j = elements.length - 1; j >= 0; j--) {
              const el = elements[j]
              if (el && typeof el === 'object' && 'props' in el) {
                const props = (el as React.ReactElement).props as Record<string, unknown>
                const elMsg = props.msg as AgentSdkMessage | undefined
                if (elMsg?.type === 'tool_use' && elMsg.toolName === 'ExitPlanMode') {
                  elements[j] = (
                    <AgentChatMessage
                      key={elMsg.id} msg={elMsg}
                      toolResult={props.toolResult as AgentSdkMessage | undefined}
                      isLast
                      onApprovePlan={() => sendPrompt('Approved. Proceed with implementation.')}
                      cwd={cwd} onOpenFile={handleOpenFile}
                    />
                  )
                  break
                }
                // Stop looking if we hit a user message (plan was already responded to)
                if (elMsg && isUserMessage(messages.indexOf(elMsg))) break
              }
            }
          }

          return elements
        })()}

        {/* Loading indicator */}
        {isRunning && (
          <div className="my-2 flex items-center gap-2 text-xs text-neutral-400">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
            {agentStatusLabel(messages, state)}
            {elapsedSeconds > 0 && (
              <span className="text-neutral-500">{formatElapsedTime(elapsedSeconds)}</span>
            )}
          </div>
        )}

        {/* Permission / interaction request */}
        {pendingPermission && (
          <PermissionRequest
            permission={pendingPermission}
            onRespond={respondToPermission}
          />
        )}

        <div ref={messagesEndRef} />
        {showScrollButton && (
          <button
            onClick={handleScrollToBottom}
            className="sticky bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 text-xs font-medium rounded-full bg-accent text-white hover:bg-accent/80 shadow-lg transition-colors z-10"
          >
            Go to End &#x2193;
          </button>
        )}
      </div>

      {/* Input area */}
      <AgentChatInput
        onSubmit={sendPrompt}
        onStop={stopAgent}
        isRunning={state === 'running' || state === 'awaiting_permission'}
        sessionId={sessionId}
        availableCommands={availableCommands}
        model={model}
        effort={effort}
        availableModels={models}
        onModelChange={setModel}
        onEffortChange={setEffort}
        permissionMode={permissionMode}
        onPermissionModeChange={setPermissionMode}
        textareaRef={composerRef}
      />
    </div>
  )
}

export const AgentChat = memo(AgentChatInner)
