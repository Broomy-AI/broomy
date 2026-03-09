/**
 * Markdown-based ReviewPanel that renders .broomy/review.md with auto-collapsing headings.
 * Action buttons come from commands.json filtered by surface='review'.
 */
import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'
import type { GitFileStatus, GitStatusResult } from '../../../preload/index'
import type { BranchStatus } from '../../store/sessions'
import type { FetchingStatus } from './useReviewData'
import { CollapsibleSection } from './CollapsibleSection'
import { createMarkdownComponents } from '../../utils/markdownComponents'
import { useReviewData } from './useReviewData'
import { useReviewActions } from './useReviewActions'
import { useCommandsConfig } from '../../hooks/useCommandsConfig'
import { computeConditionState } from '../../utils/conditionState'
import type { TemplateVars } from '../../utils/commandsConfig'
import { ActionButtons } from '../explorer/ActionButtons'

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

/** Split a section body by `### ` headings into sub-sections (skipping headings inside fenced code blocks) */
function splitSubSections(body: string): { preamble: string; subsections: { title: string; body: string }[] } {
  const lines = body.split('\n')
  const preambleLines: string[] = []
  const subsections: { title: string; body: string }[] = []
  let currentTitle: string | null = null
  let currentLines: string[] = []
  let inCodeBlock = false

  for (const line of lines) {
    if (/^(`{3,}|~{3,})/.test(line.trimStart())) {
      inCodeBlock = !inCodeBlock
    }

    if (!inCodeBlock && line.startsWith('### ')) {
      if (currentTitle !== null) {
        subsections.push({ title: currentTitle, body: currentLines.join('\n').trim() })
      }
      currentTitle = line.slice(4).trim()
      currentLines = []
    } else if (currentTitle === null) {
      preambleLines.push(line)
    } else {
      currentLines.push(line)
    }
  }

  if (currentTitle !== null) {
    subsections.push({ title: currentTitle, body: currentLines.join('\n').trim() })
  }

  return { preamble: preambleLines.join('\n').trim(), subsections }
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

/** Parse a repo-relative file link like "src/file.tsx#L12-L45" into path and line number */
function parseFileLink(href: string): { relativePath: string; line?: number } | null {
  // Skip external URLs
  if (/^https?:\/\//.test(href)) return null

  // Split off fragment: src/file.tsx#L12-L45 → path=src/file.tsx, fragment=L12-L45
  const [path, fragment] = href.split('#')
  if (!path) return null

  let line: number | undefined
  if (fragment) {
    // Match L12 or L12-L45 (take the start line)
    const match = /^L(\d+)/.exec(fragment)
    if (match) line = parseInt(match[1], 10)
  }

  return { relativePath: path, line }
}

/** Build customized markdown components with review-specific link handling */
function useReviewMarkdownComponents(
  onSelectFile: (filePath: string, openInDiffMode: boolean, scrollToLine?: number, diffBaseRef?: string) => void,
  sessionDirectory: string,
  prBaseBranch?: string,
) {
  return useMemo(() => {
    const components = createMarkdownComponents('compact')
    const diffBaseRef = `origin/${prBaseBranch || 'main'}`
    return {
      ...components,
      // Strip ### headings from rendered markdown since they're rendered as card titles
      h3: () => null,
      a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
        const handleClick = (e: React.MouseEvent) => {
          e.preventDefault()
          if (!href) return

          const fileLink = parseFileLink(href)
          if (fileLink) {
            const fullPath = `${sessionDirectory}/${fileLink.relativePath}`
            onSelectFile(fullPath, true, fileLink.line, diffBaseRef)
          } else if (href.startsWith('https://') || href.startsWith('http://')) {
            void window.shell.openExternal(href)
          }
        }
        return (
          <a href={href} className="text-accent hover:underline cursor-pointer break-all" onClick={handleClick}>
            {children}
          </a>
        )
      },
    }
  }, [onSelectFile, sessionDirectory, prBaseBranch])
}

/** A collapsible card for a ### sub-section within a ## section */
function SubSectionCard({ title, body, defaultOpen, customComponents }: {
  title: string
  body: string
  defaultOpen: boolean
  customComponents: ReturnType<typeof createMarkdownComponents>
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border border-border rounded-md bg-bg-primary/50 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-text-primary hover:bg-bg-tertiary/30 transition-colors rounded-t-md"
      >
        <svg
          className={`w-3 h-3 flex-shrink-0 transition-transform text-text-secondary ${open ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-left">{title}</span>
      </button>
      {open && (
        <div className="px-2 pb-1.5 border-t border-border/50">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            components={customComponents}
            urlTransform={(url: string) => url}
          >
            {body}
          </ReactMarkdown>
        </div>
      )}
    </div>
  )
}

/** Render a markdown section, splitting ### sub-sections into cards */
function MarkdownSection({ body, onSelectFile, sessionDirectory, prBaseBranch }: {
  body: string
  onSelectFile: (filePath: string, openInDiffMode: boolean, scrollToLine?: number, diffBaseRef?: string) => void
  sessionDirectory: string
  prBaseBranch?: string
}) {
  const customComponents = useReviewMarkdownComponents(onSelectFile, sessionDirectory, prBaseBranch)
  const { preamble, subsections } = splitSubSections(body)

  // Restore h3 rendering for preamble (no card splitting needed there)
  const preambleComponents = useMemo(() => {
    const base = createMarkdownComponents('compact')
    return { ...customComponents, h3: base.h3 }
  }, [customComponents])

  return (
    <div className="min-w-0">
      {preamble && (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={preambleComponents}
          urlTransform={(url: string) => url}
        >
          {preamble}
        </ReactMarkdown>
      )}
      {subsections.map((sub, i) => (
        <SubSectionCard
          key={`${sub.title}-${i}`}
          title={sub.title}
          body={sub.body}
          defaultOpen={hasIncompleteCheckboxes(sub.body) || i === 0}
          customComponents={customComponents}
        />
      ))}
    </div>
  )
}

/** Render the full markdown review with collapsible sections */
function MarkdownReviewContent({ markdown, onSelectFile, sessionDirectory, prBaseBranch }: {
  markdown: string
  onSelectFile: (filePath: string, openInDiffMode: boolean, scrollToLine?: number, diffBaseRef?: string) => void
  sessionDirectory: string
  prBaseBranch?: string
}) {
  const sections = splitMarkdownSections(markdown)

  if (sections.length === 0) {
    return (
      <div className="px-1.5 py-1">
        <MarkdownSection body={markdown} onSelectFile={onSelectFile} sessionDirectory={sessionDirectory} prBaseBranch={prBaseBranch} />
      </div>
    )
  }

  return (
    <div className="px-1.5 py-1">
      {sections.map((section, i) => (
        <CollapsibleSection
          key={`${section.title}-${i}`}
          title={section.title}
          defaultOpen={hasIncompleteCheckboxes(section.body) || i === 0}
        >
          <MarkdownSection body={section.body} onSelectFile={onSelectFile} sessionDirectory={sessionDirectory} prBaseBranch={prBaseBranch} />
        </CollapsibleSection>
      ))}
    </div>
  )
}

interface ReviewPanelProps {
  session: Session
  repo?: ManagedRepo
  onSelectFile: (filePath: string, openInDiffMode: boolean, scrollToLine?: number, diffBaseRef?: string) => void
  gitStatus?: GitFileStatus[]
  syncStatus?: GitStatusResult | null
  branchStatus?: BranchStatus
  onGitStatusRefresh?: () => void
}

export default function ReviewPanel({ session, repo, onSelectFile, gitStatus, syncStatus, branchStatus, onGitStatusRefresh }: ReviewPanelProps) {
  const state = useReviewData(session.id, session.directory, session.prBaseBranch)

  const {
    reviewMarkdown, fetching, waitingForAgent, fetchingStatus,
    error,
  } = state

  const {
    handleOpenPrUrl,
  } = useReviewActions(session, repo, onSelectFile, state)

  // Load commands config for action buttons
  const { config: commandsConfig } = useCommandsConfig(session.directory)

  // Compute condition state for action button visibility
  const conditionState = useMemo(() =>
    computeConditionState({
      gitStatus: gitStatus ?? [],
      syncStatus,
      branchStatus,
      prNumber: session.prNumber,
      hasWriteAccess: true,
      allowApproveAndMerge: true,
      checksStatus: 'none',
      behindMainCount: 0,
      issueNumber: session.issueNumber,
    }),
    [gitStatus, syncStatus, branchStatus, session.prNumber, session.issueNumber]
  )

  const templateVars: TemplateVars = useMemo(() => ({
    main: session.prBaseBranch || 'main',
    branch: syncStatus?.current ?? '',
    directory: session.directory,
  }), [session.prBaseBranch, syncStatus?.current, session.directory])

  const showEmptyState = !reviewMarkdown && (fetching || waitingForAgent)

  return (
    <div className="h-full flex flex-col bg-bg-secondary overflow-hidden">
      {/* Header with PR title and action buttons */}
      <div className="px-3 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-medium text-text-primary truncate flex-1">
            {session.prTitle || 'Review'}
          </h3>
          {session.prUrl && session.prNumber && (
            <button onClick={handleOpenPrUrl} className="text-xs text-accent hover:text-accent/80 flex-shrink-0 transition-colors" title="Open PR on GitHub">
              #{session.prNumber}
            </button>
          )}
        </div>
        {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
      </div>

      {/* Action buttons from commands.json filtered by surface='review' */}
      <ActionButtons
        actions={commandsConfig?.actions ?? null}
        conditionState={conditionState}
        templateVars={templateVars}
        directory={session.directory}
        agentPtyId={session.agentPtyId}
        agentId={session.agentId}
        onGitStatusRefresh={onGitStatusRefresh}
        surface="review"
      />

      <div className="flex-1 overflow-y-auto">
        {showEmptyState && (
          <ReviewEmptyState fetching={fetching} waitingForAgent={waitingForAgent} fetchingStatus={fetchingStatus} prBaseBranch={session.prBaseBranch} />
        )}

        {reviewMarkdown && (
          <MarkdownReviewContent markdown={reviewMarkdown} onSelectFile={onSelectFile} sessionDirectory={session.directory} prBaseBranch={session.prBaseBranch} />
        )}
      </div>
    </div>
  )
}
