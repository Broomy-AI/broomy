/**
 * Renders tool-aware permission/interaction requests in the Agent SDK chat.
 *
 * Different tools get different UI:
 * - ExitPlanMode: "Approve Plan" / "Request Changes" (plan is already rendered inline)
 * - AskUserQuestion: Shows questions with selectable options
 * - Default: Generic "Allow" / "Deny" with tool input preview
 */
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createMarkdownComponents } from '../../shared/utils/markdownComponents'
import type { AgentSdkPermissionRequest } from '../../../shared/agentSdkTypes'

const markdownComponents = createMarkdownComponents('compact')

interface PermissionRequestProps {
  permission: AgentSdkPermissionRequest
  onRespond: (toolUseId: string, allowed: boolean, updatedInput?: Record<string, unknown>) => void
}

interface QuestionOption {
  label: string
  description?: string
  preview?: string
}

interface Question {
  question: string
  header?: string
  options: QuestionOption[]
  multiSelect?: boolean
}

function PlanApproval({ permission, onRespond }: PermissionRequestProps) {
  return (
    <div className="my-2 rounded border border-blue-700/30 bg-blue-900/10 px-3 py-2">
      <div className="text-sm font-medium text-blue-200">Plan ready for review</div>
      <div className="mt-1 text-xs text-neutral-400">
        The plan is shown above. Approve to start implementation, or reject to request changes.
      </div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => onRespond(permission.toolUseId, true)}
          className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500"
        >
          Approve Plan
        </button>
        <button
          onClick={() => onRespond(permission.toolUseId, false)}
          className="rounded bg-neutral-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-500"
        >
          Reject
        </button>
      </div>
    </div>
  )
}

function QuestionUI({ permission, onRespond }: PermissionRequestProps) {
  const input = permission.toolInput
  const questions = (input.questions ?? input) as Question[] | Question
  const questionList = Array.isArray(questions) ? questions : [questions]
  const [answers, setAnswers] = useState<Record<string, string>>({})

  const handleSelect = (questionText: string, label: string) => {
    setAnswers(prev => ({ ...prev, [questionText]: label }))
  }

  const handleSubmit = () => {
    // Pass answers back as updatedInput
    const updatedInput = { ...input, answers }
    onRespond(permission.toolUseId, true, updatedInput)
  }

  const allAnswered = questionList.every(q => answers[q.question])

  return (
    <div className="my-2 rounded border border-purple-700/30 bg-purple-900/10 px-3 py-3">
      {questionList.map((q) => (
        <div key={q.question} className="mb-3 last:mb-0">
          {q.header && (
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-purple-400">
              {q.header}
            </div>
          )}
          <div className="mb-2 text-sm text-neutral-200">{q.question}</div>
          <div className="space-y-1">
            {q.options.map((opt) => (
              <button
                key={opt.label}
                onClick={() => handleSelect(q.question, opt.label)}
                className={`flex w-full items-start gap-2 rounded px-3 py-1.5 text-left text-xs transition-colors ${
                  answers[q.question] === opt.label
                    ? 'bg-purple-600/30 border border-purple-500/50 text-neutral-100'
                    : 'bg-neutral-800/50 border border-neutral-700 text-neutral-300 hover:bg-neutral-700/50'
                }`}
              >
                <span className="mt-0.5 flex-shrink-0">
                  {answers[q.question] === opt.label ? '●' : '○'}
                </span>
                <div>
                  <div className="font-medium">{opt.label}</div>
                  {opt.description && (
                    <div className="mt-0.5 text-neutral-400">{opt.description}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!allAnswered}
          className="rounded bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-50"
        >
          Submit
        </button>
        <button
          onClick={() => onRespond(permission.toolUseId, false)}
          className="rounded bg-neutral-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-500"
        >
          Skip
        </button>
      </div>
    </div>
  )
}

function GenericPermission({ permission, onRespond }: PermissionRequestProps) {
  const input = permission.toolInput
  // Check if the input has markdown-like content worth rendering
  const contentFields = ['content', 'text', 'description', 'message']
  const markdownField = contentFields.find(f => {
    const v = input[f]
    return typeof v === 'string' && v.length > 50
  })
  const markdownContent = markdownField ? (input[markdownField] as string) : null

  return (
    <div className="my-2 rounded border border-yellow-700 bg-yellow-900/20 px-3 py-2">
      <div className="text-sm text-yellow-200">
        Claude wants to use <span className="font-mono font-bold">{permission.toolName}</span>
      </div>
      {permission.decisionReason && (
        <div className="mt-1 text-xs text-yellow-300/70">{permission.decisionReason}</div>
      )}
      {markdownContent ? (
        <div className="mt-2 max-h-60 overflow-auto rounded bg-neutral-800 px-3 py-2 text-sm text-neutral-200">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {markdownContent}
          </ReactMarkdown>
        </div>
      ) : (
        <pre className="mt-2 max-h-40 overflow-auto rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300">
          {JSON.stringify(input, null, 2)}
        </pre>
      )}
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => onRespond(permission.toolUseId, true)}
          className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-500"
        >
          Allow
        </button>
        <button
          onClick={() => onRespond(permission.toolUseId, false)}
          className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-500"
        >
          Deny
        </button>
      </div>
    </div>
  )
}

export function PermissionRequest({ permission, onRespond }: PermissionRequestProps) {
  switch (permission.toolName) {
    case 'ExitPlanMode':
      return <PlanApproval permission={permission} onRespond={onRespond} />
    case 'AskUserQuestion':
      return <QuestionUI permission={permission} onRespond={onRespond} />
    default:
      return <GenericPermission permission={permission} onRespond={onRespond} />
  }
}
