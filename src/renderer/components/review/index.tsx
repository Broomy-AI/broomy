/**
 * Markdown-based ReviewPanel that renders .broomy/review.md with auto-collapsing headings.
 */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'
import type { FetchingStatus } from './useReviewData'
import { CollapsibleSection } from './CollapsibleSection'
import { GitignoreModal } from './GitignoreModal'
import { createMarkdownComponents } from '../../utils/markdownComponents'
import { useReviewData } from './useReviewData'
import { useReviewActions } from './useReviewActions'

/** Split markdown into sections by `## ` headings (skipping headings inside fenced code blocks) */
function splitMarkdownSections(markdown: string): { title: string; body: string }[] {
  const lines = markdown.split('\n')
  const sections: { title: string; body: string }[] = []
  let currentTitle: string | null = null
  let currentLines: string[] = []
  let preambleLines: string[] = []
  let inCodeBlock = false

  for (const line of lines) {
    // Track fenced code blocks (``` or ~~~)
    if (/^(`{3,}|~{3,})/.test(line.trimStart())) {
      inCodeBlock = !inCodeBlock
    }

    if (!inCodeBlock && line.startsWith('## ')) {
      if (currentTitle !== null) {
        sections.push({ title: currentTitle, body: currentLines.join('\n').trim() })
      } else if (currentLines.length > 0) {
        preambleLines = currentLines
      }
      currentTitle = line.slice(3).trim()
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }

  // Push final section
  if (currentTitle !== null) {
    sections.push({ title: currentTitle, body: currentLines.join('\n').trim() })
  } else if (currentLines.length > 0) {
    preambleLines = [...preambleLines, ...currentLines]
  }

  // If there's preamble (content before first ##), add it as a section
  const preamble = preambleLines.join('\n').trim()
  if (preamble) {
    sections.unshift({ title: 'Overview', body: preamble })
  }

  return sections
}

/** Check if a section body contains incomplete task checkboxes */
function hasIncompleteCheckboxes(body: string): boolean {
  return body.includes('- [ ]')
}

function ReviewEmptyState({
  fetching, waitingForAgent, fetchingStatus, prBaseBranch,
}: {
  fetching: boolean
  waitingForAgent: boolean
  fetchingStatus: FetchingStatus
  prBaseBranch?: string
}) {
  if (fetching) {
    return (
      <div className="flex items-center justify-center h-full text-text-primary px-4">
        <div className="text-center max-w-xs">
          <div className="text-sm">Fetching latest changes...</div>
        </div>
      </div>
    )
  }

  if (waitingForAgent) {
    return (
      <div className="flex items-center justify-center h-full text-text-primary px-4">
        <div className="text-center max-w-xs">
          {fetchingStatus === 'fetching' ? (
            <>
              <div className="text-sm mb-3 flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Fetching {prBaseBranch || 'main'} to compare...
              </div>
              <div className="text-xs text-text-secondary">
                Pulling the latest changes before generating the review.
              </div>
            </>
          ) : (
            <>
              <div className="text-sm mb-3">
                Review instructions have been sent to your agent terminal.
              </div>
              <div className="text-xs text-text-secondary">
                The review will appear here once your agent writes it to <code className="font-mono bg-bg-tertiary px-1 rounded">.broomy/output/review.md</code>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return null
}

function GenerateButton({ fetching, waitingForAgent, reviewMarkdown, disabled, onClick }: {
  fetching: boolean
  waitingForAgent: boolean
  reviewMarkdown: string | null
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 py-1.5 text-xs rounded bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {fetching ? (
        <span className="flex items-center justify-center gap-1.5">
          <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Fetching latest...
        </span>
      ) : waitingForAgent ? (
        <span className="flex items-center justify-center gap-1.5">
          <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Waiting for agent...
        </span>
      ) : reviewMarkdown ? 'Regenerate Review' : 'Generate Review'}
    </button>
  )
}

function ReviewPanelHeader({ session, fetching, waitingForAgent, reviewMarkdown, error, onGenerate, onOpenPr }: {
  session: Session; fetching: boolean; waitingForAgent: boolean; reviewMarkdown: string | null
  error: string | null
  onGenerate: () => void; onOpenPr: () => void
}) {
  return (
    <div className="px-3 py-2 border-b border-border flex-shrink-0">
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-sm font-medium text-text-primary truncate flex-1">
          {session.prTitle || 'Review'}
        </h3>
        {session.prUrl && (
          <button onClick={onOpenPr} className="text-xs text-accent hover:text-accent/80 flex-shrink-0 transition-colors" title="Open PR on GitHub">
            #{session.prNumber}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <GenerateButton fetching={fetching} waitingForAgent={waitingForAgent} reviewMarkdown={reviewMarkdown} disabled={fetching || waitingForAgent || !session.agentPtyId} onClick={onGenerate} />
      </div>
      {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
    </div>
  )
}

/** Render a markdown section with custom link handling */
function MarkdownSection({ body, onSelectFile }: {
  body: string
  onSelectFile: (filePath: string, openInDiffMode: boolean) => void
}) {
  const components = createMarkdownComponents('compact')

  // Override link handler: GitHub URLs open in file panel webview, others in system browser
  const customComponents = {
    ...components,
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
      const handleClick = (e: React.MouseEvent) => {
        e.preventDefault()
        if (!href) return
        if (href.startsWith('https://github.com/')) {
          onSelectFile(href, false)
        } else if (href.startsWith('https://') || href.startsWith('http://')) {
          void window.shell.openExternal(href)
        }
      }
      return (
        <a href={href} className="text-accent hover:underline cursor-pointer" onClick={handleClick}>
          {children}
        </a>
      )
    },
  }

  return (
    <div className="px-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={customComponents}
        urlTransform={(url: string) => url}
      >
        {body}
      </ReactMarkdown>
    </div>
  )
}

/** Render the full markdown review with collapsible sections */
function MarkdownReviewContent({ markdown, onSelectFile }: {
  markdown: string
  onSelectFile: (filePath: string, openInDiffMode: boolean) => void
}) {
  const sections = splitMarkdownSections(markdown)

  if (sections.length === 0) {
    return (
      <div className="px-3 py-2">
        <MarkdownSection body={markdown} onSelectFile={onSelectFile} />
      </div>
    )
  }

  return (
    <div className="px-3 py-2">
      {sections.map((section, i) => (
        <CollapsibleSection
          key={`${section.title}-${i}`}
          title={section.title}
          defaultOpen={hasIncompleteCheckboxes(section.body) || i === 0}
        >
          <MarkdownSection body={section.body} onSelectFile={onSelectFile} />
        </CollapsibleSection>
      ))}
    </div>
  )
}

interface ReviewPanelProps {
  session: Session
  repo?: ManagedRepo
  onSelectFile: (filePath: string, openInDiffMode: boolean, scrollToLine?: number, diffBaseRef?: string) => void
}

export default function ReviewPanel({ session, repo, onSelectFile }: ReviewPanelProps) {
  const state = useReviewData(session.id, session.directory, session.prBaseBranch)

  const {
    reviewMarkdown, fetching, waitingForAgent, fetchingStatus,
    error, showGitignoreModal,
  } = state

  const {
    handleGenerateReview, handleOpenPrUrl,
    handleGitignoreAdd, handleGitignoreContinue, handleGitignoreCancel,
  } = useReviewActions(session, repo, onSelectFile, state)

  const showEmptyState = !reviewMarkdown && (fetching || waitingForAgent)
  const showPromo = !reviewMarkdown && !fetching && !waitingForAgent

  return (
    <div className="h-full flex flex-col bg-bg-secondary overflow-hidden">
      {showGitignoreModal && (
        <GitignoreModal
          onAddToGitignore={handleGitignoreAdd}
          onContinueWithout={handleGitignoreContinue}
          onCancel={handleGitignoreCancel}
        />
      )}

      <ReviewPanelHeader
        session={session} fetching={fetching} waitingForAgent={waitingForAgent}
        reviewMarkdown={reviewMarkdown}
        error={error}
        onGenerate={handleGenerateReview}
        onOpenPr={handleOpenPrUrl}
      />

      <div className="flex-1 overflow-y-auto">
        {showEmptyState && (
          <ReviewEmptyState fetching={fetching} waitingForAgent={waitingForAgent} fetchingStatus={fetchingStatus} prBaseBranch={session.prBaseBranch} />
        )}

        {showPromo && (
          <div className="flex items-center justify-center h-full text-text-primary text-sm px-4 text-center">
            <div>
              <p className="mb-2">Click "Generate Review" to get an AI-generated review of this PR.</p>
              <p className="text-xs text-text-secondary">The review will be written as markdown to <code className="font-mono bg-bg-tertiary px-1 rounded">.broomy/output/review.md</code></p>
              <p className="text-xs text-text-secondary mt-1">Customize the review process by editing <code className="font-mono bg-bg-tertiary px-1 rounded">.claude/commands/broomy-action-review-md.md</code></p>
            </div>
          </div>
        )}

        {reviewMarkdown && (
          <MarkdownReviewContent markdown={reviewMarkdown} onSelectFile={onSelectFile} />
        )}
      </div>
    </div>
  )
}
