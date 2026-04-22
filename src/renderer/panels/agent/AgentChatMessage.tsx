/**
 * Renders a single Agent SDK message in the chat view.
 */
import React, { useState, useRef, useEffect, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createMarkdownComponents } from '../../shared/utils/markdownComponents'
import type { AgentSdkMessage } from '../../../shared/agentSdkTypes'

const markdownComponents = createMarkdownComponents('compact')

/** Strip workspace prefix from an absolute path to make it relative. */
function relativePath(absPath: string, cwd?: string): string {
  if (!cwd || !absPath.startsWith(cwd)) return absPath
  const rel = absPath.slice(cwd.length)
  return rel.startsWith('/') ? rel.slice(1) : rel
}

/** Format a tool call as a friendly one-line description (for expanded view). */
function formatToolDescription(toolName: string, input: Record<string, unknown>, cwd?: string): string {
  const rel = (p: unknown) => typeof p === 'string' ? relativePath(p, cwd) : ''
  switch (toolName) {
    case 'Bash': {
      const cmd = str(input.command, 200)
      const desc = str(input.description, 100)
      return desc ? `${desc}\n$ ${cmd}` : `$ ${cmd}`
    }
    case 'Read': case 'FileRead':
      return `Reading ${rel(input.file_path) || rel(input.path)}`
    case 'Glob':
      return `Finding files matching ${str(input.pattern)}${input.path ? ` in ${rel(input.path)}` : ''}`
    case 'Grep':
      return `Searching for /${str(input.pattern)}/${input.path ? ` in ${rel(input.path)}` : ''}`
    case 'WebSearch':
      return `Searching the web for "${str(input.query)}"`
    case 'WebFetch':
      return `Fetching ${str(input.url)}`
    case 'Agent':
      return str(input.description) || str(input.prompt, 100)
    default: {
      // Show key=value pairs for unknown tools
      return Object.entries(input)
        .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
        .map(([k, v]) => `${k}: ${String(v).slice(0, 80)}`)
        .join('\n')
    }
  }
}

/** Safely extract a string from an unknown input field. */
function str(value: unknown, maxLen = 200): string {
  return typeof value === 'string' ? value.slice(0, maxLen) : ''
}

/** Format tool input into a human-readable summary line. */
function formatToolSummary(toolName: string, input: Record<string, unknown>): string {
  const path = str(input.file_path) || str(input.path)
  switch (toolName) {
    case 'Read':
    case 'FileRead':
    case 'Write':
    case 'FileWrite':
    case 'Edit':
    case 'FileEdit':
      return path
    case 'Bash':
      return str(input.command, 120)
    case 'Glob':
      return str(input.pattern) + (input.path ? ` in ${str(input.path)}` : '')
    case 'Grep': {
      let s = `/${str(input.pattern)}/`
      if (input.path) s += ` in ${str(input.path)}`
      if (input.glob) s += ` (${str(input.glob)})`
      return s
    }
    case 'WebSearch':
      return str(input.query)
    case 'WebFetch':
      return str(input.url)
    case 'Agent':
      return str(input.description) || str(input.prompt, 100)
    default: {
      const firstVal = Object.values(input).find(v => typeof v === 'string')
      return typeof firstVal === 'string' ? firstVal.slice(0, 100) : ''
    }
  }
}

/** Tools whose input contains markdown content that should be shown to the user. */
const CONTENT_TOOLS: Record<string, string> = {
  ExitPlanMode: 'plan',
  EnterPlanMode: 'plan',
}

/** Check if a tool's input has markdown content to display inline. */
function getToolMarkdownContent(toolName: string, input: Record<string, unknown>): string | null {
  const field = CONTENT_TOOLS[toolName]
  const value = field ? input[field] : undefined
  if (typeof value === 'string') return value
  return null
}

/** Collapsible content block — shows ~10 lines by default, expandable. */
function CollapsibleContent({ children, maxCollapsedHeight = 200 }: { children?: React.ReactNode; maxCollapsedHeight?: number }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [needsExpand, setNeedsExpand] = useState(false)

  useEffect(() => {
    if (contentRef.current) {
      setNeedsExpand(contentRef.current.scrollHeight > maxCollapsedHeight)
    }
  }, [children, maxCollapsedHeight])

  return (
    <div className="relative">
      <div
        ref={contentRef}
        className="overflow-hidden transition-[max-height] duration-200"
        style={{ maxHeight: isExpanded || !needsExpand ? 'none' : `${String(maxCollapsedHeight)}px` }}
      >
        {children}
      </div>
      {needsExpand && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-1 text-xs text-blue-400 hover:text-blue-300"
        >
          {isExpanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

/** Render an Edit tool as an inline diff. */
function EditDiffBlock({ msg, cwd, onOpenFile }: { msg: AgentSdkMessage; cwd?: string; onOpenFile?: (path: string) => void }) {
  const input = msg.toolInput ?? {}
  const filePath = str(input.file_path) || str(input.path)
  const oldStr = str(input.old_string, 10000)
  const newStr = str(input.new_string, 10000)

  return (
    <div className="my-1 rounded border border-neutral-700 bg-neutral-800/50">
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
        <span className="rounded bg-yellow-900/50 px-1.5 py-0.5 font-mono text-yellow-300">Edit</span>
        <span className="truncate font-mono text-neutral-400">{relativePath(filePath, cwd)}</span>
        {onOpenFile && filePath && (
          <button
            onClick={() => onOpenFile(filePath)}
            className="ml-auto flex-shrink-0 text-blue-400 hover:text-blue-300"
            title="Open in file panel"
          >
            Open
          </button>
        )}
      </div>
      <CollapsibleContent>
        <div className="border-t border-neutral-700 px-3 py-2 font-mono text-xs">
          {oldStr && (
            <div className="mb-1">
              {oldStr.split('\n').map((line, i) => (
                <div key={`old-${String(i)}`} className="bg-red-900/20 text-red-300">
                  <span className="mr-2 inline-block w-4 text-right text-red-500/50">-</span>
                  {line}
                </div>
              ))}
            </div>
          )}
          {newStr && (
            <div>
              {newStr.split('\n').map((line, i) => (
                <div key={`new-${String(i)}`} className="bg-green-900/20 text-green-300">
                  <span className="mr-2 inline-block w-4 text-right text-green-500/50">+</span>
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </div>
  )
}

/** Render a Write tool showing file path and content. */
function WriteBlock({ msg, cwd, onOpenFile }: { msg: AgentSdkMessage; cwd?: string; onOpenFile?: (path: string) => void }) {
  const input = msg.toolInput ?? {}
  const filePath = str(input.file_path) || str(input.path)
  const content = str(input.content, 10000)
  return (
    <div className="my-1 rounded border border-neutral-700 bg-neutral-800/50">
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
        <span className="rounded bg-green-900/50 px-1.5 py-0.5 font-mono text-green-300">Write</span>
        <span className="truncate font-mono text-neutral-400">{relativePath(filePath, cwd)}</span>
        {onOpenFile && filePath && (
          <button
            onClick={() => onOpenFile(filePath)}
            className="ml-auto flex-shrink-0 text-blue-400 hover:text-blue-300"
            title="Open in file panel"
          >
            Open
          </button>
        )}
      </div>
      {content && (
        <CollapsibleContent>
          <pre className="border-t border-neutral-700 px-3 py-2 text-xs text-neutral-300">
            {content}
          </pre>
        </CollapsibleContent>
      )}
    </div>
  )
}

/** Render a plan or markdown content tool. */
function PlanBlock({ msg, isLast, onApprovePlan, onOpenFile }: { msg: AgentSdkMessage; isLast?: boolean; onApprovePlan?: () => void; onOpenFile?: (path: string) => void }) {
  const input = msg.toolInput ?? {}
  const toolName = msg.toolName ?? ''
  const markdownContent = getToolMarkdownContent(toolName, input)
  if (!markdownContent) return null
  return (
    <div className="my-2 rounded border border-blue-700/30 bg-neutral-800/50">
      <div className="flex items-center gap-2 border-b border-blue-700/30 px-3 py-1.5 text-xs">
        <span className="rounded bg-blue-900/50 px-1.5 py-0.5 font-mono text-blue-300">
          {toolName === 'ExitPlanMode' ? 'Plan' : toolName}
        </span>
        {typeof input.planFilePath === 'string' && (
          <span className="truncate font-mono text-neutral-500">{str(input.planFilePath)}</span>
        )}
        {onOpenFile && typeof input.planFilePath === 'string' && (
          <button
            onClick={() => onOpenFile(input.planFilePath as string)}
            className="ml-auto flex-shrink-0 text-blue-400 hover:text-blue-300"
          >
            Open
          </button>
        )}
      </div>
      <CollapsibleContent maxCollapsedHeight={250}>
        <div className="px-4 py-3 text-sm text-neutral-200">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {markdownContent}
          </ReactMarkdown>
        </div>
      </CollapsibleContent>
      {isLast && toolName === 'ExitPlanMode' && onApprovePlan && (
        <div className="border-t border-blue-700/30 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <button
              onClick={onApprovePlan}
              className="rounded bg-green-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-green-500"
            >
              Approve Plan
            </button>
            <span className="text-xs text-neutral-500">
              or reply with feedback to refine it
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Render TodoWrite as a task list. */
function TodoBlock({ input }: { input: Record<string, unknown> }) {
  const todos = Array.isArray(input.todos) ? input.todos as Record<string, unknown>[] : []
  if (todos.length === 0) return null

  return (
    <div className="my-1 rounded border border-neutral-700 bg-neutral-800/50 px-3 py-2">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-neutral-500">Tasks</div>
      {todos.map((todo) => {
        const status = str(todo.status)
        const content = str(todo.content)
        const icon = status === 'completed' ? '✓' : status === 'in_progress' ? '◐' : '○'
        const color = status === 'completed' ? 'text-green-400' : status === 'in_progress' ? 'text-blue-400' : 'text-neutral-500'
        return (
          <div key={str(todo.id) || content} className="flex items-start gap-2 py-0.5 text-xs">
            <span className={`flex-shrink-0 ${color}`}>{icon}</span>
            <span className={status === 'completed' ? 'text-neutral-400' : 'text-neutral-200'}>{content}</span>
          </div>
        )
      })}
    </div>
  )
}

function ToolUseBlock({ msg, toolResult, isLast, onApprovePlan, cwd, onOpenFile }: { key?: string | number | bigint | null; msg: AgentSdkMessage; toolResult?: AgentSdkMessage; isLast?: boolean; onApprovePlan?: () => void; cwd?: string; onOpenFile?: (path: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const input = msg.toolInput ?? {}
  const toolName = msg.toolName ?? ''
  const summary = formatToolSummary(toolName, input)
  const resultText = toolResult?.toolResult ?? ''
  const hasError = toolResult?.isError === true

  if (toolName === 'Edit' || toolName === 'FileEdit') return <EditDiffBlock msg={msg} cwd={cwd} onOpenFile={onOpenFile} />
  if (toolName === 'Write' || toolName === 'FileWrite') return <WriteBlock msg={msg} cwd={cwd} onOpenFile={onOpenFile} />
  if (toolName === 'TodoWrite') return <TodoBlock input={input} />
  if (getToolMarkdownContent(toolName, input)) return <PlanBlock msg={msg} isLast={isLast} onApprovePlan={onApprovePlan} onOpenFile={onOpenFile} />

  // Generic tool — collapsible chip
  return (
    <div className={`my-1 rounded border ${hasError ? 'border-red-800/50' : 'border-neutral-700'} bg-neutral-800/50`}>
      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-neutral-700/30"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-neutral-400">{expanded ? '▼' : '▶'}</span>
        <span className={`rounded px-1.5 py-0.5 font-mono ${hasError ? 'bg-red-900/50 text-red-300' : 'bg-blue-900/50 text-blue-300'}`}>
          {toolName}
        </span>
        {summary && (
          <span className="truncate font-mono text-neutral-400">
            {summary}
          </span>
        )}
      </button>
      {expanded && (
        <div className="border-t border-neutral-700">
          <pre className="max-h-40 overflow-auto px-3 py-2 text-xs text-neutral-300 whitespace-pre-wrap">
            {formatToolDescription(toolName, input, cwd)}
          </pre>
          {resultText && (
            <>
              <div className={`border-t ${hasError ? 'border-red-800/50' : 'border-neutral-700'} px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider ${hasError ? 'text-red-400' : 'text-neutral-500'}`}>
                {hasError ? 'Error' : 'Output'}
              </div>
              <pre className={`max-h-60 overflow-auto px-3 pb-2 text-xs whitespace-pre-wrap ${hasError ? 'text-red-300' : 'text-neutral-300'}`}>
                {resultText.length > 3000 ? `${resultText.slice(0, 3000)}\n... (truncated)` : resultText}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function AgentChatMessageInner({ msg, isUserMessage, toolResult, isLast, onApprovePlan, cwd, onOpenFile }: { msg: AgentSdkMessage; isUserMessage?: boolean; toolResult?: AgentSdkMessage; isLast?: boolean; onApprovePlan?: () => void; cwd?: string; onOpenFile?: (path: string) => void }) {
  if (msg.type === 'text') {
    if (isUserMessage) {
      return (
        <div className="my-2 flex justify-end">
          <div className="max-w-[85%]">
            <div className="rounded-lg bg-blue-600/20 border border-blue-700/30 px-3 py-2 text-sm text-neutral-200 whitespace-pre-wrap">
              {msg.text}
            </div>
            {msg.queued && (
              <div className="mt-0.5 flex items-center justify-end gap-1 text-xs text-neutral-500">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-500" />
                Queued
              </div>
            )}
          </div>
        </div>
      )
    }
    return (
      <div className="my-1.5 text-sm text-neutral-200">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {msg.text ?? ''}
        </ReactMarkdown>
      </div>
    )
  }

  if (msg.type === 'tool_use') {
    return <ToolUseBlock msg={msg} toolResult={toolResult} isLast={isLast} onApprovePlan={onApprovePlan} cwd={cwd} onOpenFile={onOpenFile} />
  }

  if (msg.type === 'tool_result') {
    // Rendered inside the tool_use block, not standalone
    return null
  }

  if (msg.type === 'system') {
    return (
      <div className="my-1 text-center text-xs text-neutral-500">
        {msg.text}
      </div>
    )
  }

  if (msg.type === 'result') {
    // Don't render msg.result text — it duplicates the preceding assistant message.
    // Only show the stats (duration, turns).
    const hasStats = msg.durationMs !== undefined || msg.numTurns !== undefined
    if (!hasStats) return null
    return (
      <div className="my-1">
        <div className="flex gap-3 text-xs text-neutral-500">
          {msg.durationMs !== undefined && (
            <span>{(msg.durationMs / 1000).toFixed(1)}s</span>
          )}
          {msg.numTurns !== undefined && (
            <span>{msg.numTurns} turn{msg.numTurns !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
    )
  }

  // error type
  return (
    <div className="my-2 rounded border border-red-800 bg-red-900/20 px-3 py-2 text-sm text-red-300">
      {msg.text}
    </div>
  )
}

export const AgentChatMessage = memo(AgentChatMessageInner)

/**
 * Renders a group of consecutive read/search tool calls as a single
 * collapsible block, summarized by the most recent tool call.
 */
export function ToolGroupBlock({ items }: {
  key?: string | number | bigint | null
  items: { msg: AgentSdkMessage; toolResult?: AgentSdkMessage }[]
}) {
  const [expanded, setExpanded] = useState(false)
  const last = items[items.length - 1]
  const lastSummary = formatToolSummary(last.msg.toolName ?? '', last.msg.toolInput ?? {})
  const hasAnyError = items.some(item => item.toolResult?.isError === true)

  // Summarize the tool types in the group
  const toolCounts = new Map<string, number>()
  for (const item of items) {
    const name = item.msg.toolName ?? 'unknown'
    toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1)
  }
  const countSummary = [...toolCounts.entries()]
    .map(([name, count]) => count > 1 ? `${String(count)} ${name}` : name)
    .join(', ')

  return (
    <div className={`my-1 rounded border ${hasAnyError ? 'border-red-800/50' : 'border-neutral-700'} bg-neutral-800/50`}>
      <button
        className="flex w-full items-center gap-2 overflow-hidden whitespace-nowrap px-3 py-1.5 text-left text-xs hover:bg-neutral-700/30"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex-shrink-0 text-neutral-400">{expanded ? '▼' : '▶'}</span>
        <span className="flex-shrink-0 rounded bg-neutral-700 px-1.5 py-0.5 text-neutral-300">
          {`${String(items.length)} tool uses`}
        </span>
        <span className="flex-shrink-0 text-neutral-500">{countSummary}</span>
        {lastSummary && (
          <span className="truncate font-mono text-neutral-500">— {lastSummary}</span>
        )}
      </button>
      {expanded && (
        <div className="border-t border-neutral-700">
          {items.map((item) => (
            <ToolUseBlock key={item.msg.id} msg={item.msg} toolResult={item.toolResult} />
          ))}
        </div>
      )}
    </div>
  )
}
