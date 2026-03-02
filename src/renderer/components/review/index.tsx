/**
 * Top-level ReviewPanel that orchestrates review generation, comment management, and the review display.
 * Also renders optional Checks, Analyses, and Walkthrough sections based on repo configuration.
 */
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'
import type { FetchingStatus, NormalizedComment } from './useReviewData'
import type { ReviewData, CodeLocation } from '../../types/review'
import { CollapsibleSection } from './CollapsibleSection'
import { GitignoreModal } from './GitignoreModal'
import { MarkdownBody, ReviewContent } from './ReviewContent'
import { PrCommentsSection } from './PrComments'
import { useReviewData } from './useReviewData'
import { useReviewActions } from './useReviewActions'
import { useChecksRunner } from './checks/useChecksRunner'
import { ChecksSection } from './checks/ChecksSection'
import { useAnalysesData } from './analyses/useAnalysesData'
import { useAnalysesActions } from './analyses/useAnalysesActions'
import { AnalysesSection } from './analyses/AnalysesSection'
import { useWalkthroughData } from './walkthrough/useWalkthroughData'
import { useWalkthroughActions } from './walkthrough/useWalkthroughActions'
import { WalkthroughSection } from './walkthrough/WalkthroughSection'

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
                Review instructions have been pasted into your agent terminal.
              </div>
              <div className="text-sm text-text-secondary mb-4">
                Press <kbd className="px-1.5 py-0.5 rounded bg-bg-tertiary border border-border font-mono text-xs">Enter</kbd> in the agent terminal to start the review.
              </div>
              <div className="text-xs text-text-secondary">
                The review will appear here once your agent writes it to <code className="font-mono bg-bg-tertiary px-1 rounded">.broomy/review.json</code>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return null
}

function GenerateButton({ fetching, waitingForAgent, reviewData, disabled, onClick }: {
  fetching: boolean
  waitingForAgent: boolean
  reviewData: ReviewData | null
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
      ) : reviewData ? 'Regenerate Review' : 'Generate Review'}
    </button>
  )
}

function PreReviewContent({
  session,
  prDescription,
  prGitHubComments,
  prCommentsLoading,
  prCommentsHasMore,
  loadOlderComments,
  refreshComments,
  handleClickLocation,
}: {
  session: Session
  prDescription: string | null
  prGitHubComments: NormalizedComment[]
  prCommentsLoading: boolean
  prCommentsHasMore: boolean
  loadOlderComments: () => void
  refreshComments: () => void
  handleClickLocation: (location: CodeLocation) => void
}) {
  return (
    <div className="px-3 py-2">
      {prDescription && (
        <CollapsibleSection title="PR Description" defaultOpen={false}>
          <MarkdownBody content={prDescription} />
        </CollapsibleSection>
      )}
      {prGitHubComments.length > 0 && session.prNumber && (
        <PrCommentsSection
          prGitHubComments={prGitHubComments}
          prCommentsLoading={prCommentsLoading}
          prCommentsHasMore={prCommentsHasMore}
          onLoadOlderComments={loadOlderComments}
          onClickLocation={handleClickLocation}
          repoDir={session.directory}
          prNumber={session.prNumber}
          onRefreshComments={refreshComments}
        />
      )}
      <div className="mt-4 text-center text-sm text-text-secondary px-4">
        <p>Click "Generate Review" to get an AI-generated structured review of this PR.</p>
      </div>
    </div>
  )
}

function ExtendedReviewSections({ session, repo, onSelectFile }: {
  session: Session
  repo?: ManagedRepo
  onSelectFile: (filePath: string, openInDiffMode: boolean, scrollToLine?: number, diffBaseRef?: string) => void
}) {
  const enabledAnalyses = repo?.enabledAnalyses ?? []
  const checksState = useChecksRunner(session.directory, repo)
  const analysesResults = useAnalysesData(session.directory, enabledAnalyses)
  const analysesActions = useAnalysesActions(session.directory, session.agentPtyId, enabledAnalyses)
  const walkthroughData = useWalkthroughData(session.directory)
  const walkthroughActions = useWalkthroughActions(session.directory, session.agentPtyId, repo?.walkthroughInstructions)

  const hasAny = repo?.checksEnabled || enabledAnalyses.length > 0 || repo?.walkthroughEnabled
  if (!hasAny) return null

  return (
    <>
      {repo?.checksEnabled && <ChecksSection state={checksState} />}
      {enabledAnalyses.length > 0 && (
        <AnalysesSection
          enabledAnalyses={enabledAnalyses}
          results={analysesResults}
          actions={analysesActions}
          onClickLocation={(file, line) => {
            const fullPath = file.startsWith('/') ? file : `${session.directory}/${file}`
            onSelectFile(fullPath, true, line)
          }}
        />
      )}
      {repo?.walkthroughEnabled && (
        <WalkthroughSection
          data={walkthroughData}
          actions={walkthroughActions}
          directory={session.directory}
          onSelectFile={onSelectFile}
        />
      )}
    </>
  )
}

interface ReviewPanelProps {
  session: Session
  repo?: ManagedRepo
  onSelectFile: (filePath: string, openInDiffMode: boolean, scrollToLine?: number, diffBaseRef?: string) => void
}

export default function ReviewPanel({ session, repo, onSelectFile }: ReviewPanelProps) {
  const state = useReviewData(session.id, session.directory, session.prBaseBranch, session.prNumber)

  const {
    reviewData, comments, comparison, fetching, waitingForAgent, fetchingStatus,
    pushing, pushResult, error, showGitignoreModal, unpushedCount,
    prDescription, prGitHubComments, prCommentsLoading, prCommentsHasMore,
    loadOlderComments, refreshComments,
  } = state

  const {
    handleGenerateReview, handlePushComments, handleDeleteComment, handleOpenPrUrl,
    handleClickLocation, handleGitignoreAdd, handleGitignoreContinue, handleGitignoreCancel,
  } = useReviewActions(session, repo, onSelectFile, state)

  const hasPreReviewContent = !!(prDescription || prGitHubComments.length > 0)
  const isIdle = !reviewData && !fetching && !waitingForAgent
  const showPreReview = isIdle && hasPreReviewContent
  const showPromo = isIdle && !hasPreReviewContent
  const showPushButton = comments.length > 0 && !!session.prNumber

  return (
    <div className="h-full flex flex-col bg-bg-secondary overflow-hidden">
      {showGitignoreModal && (
        <GitignoreModal
          onAddToGitignore={handleGitignoreAdd}
          onContinueWithout={handleGitignoreContinue}
          onCancel={handleGitignoreCancel}
        />
      )}

      <div className="px-3 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-medium text-text-primary truncate flex-1">
            {session.prTitle || 'Review'}
          </h3>
          {session.prUrl && (
            <button
              onClick={handleOpenPrUrl}
              className="text-xs text-accent hover:text-accent/80 flex-shrink-0 transition-colors"
              title="Open PR on GitHub"
            >
              #{session.prNumber}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <GenerateButton
            fetching={fetching}
            waitingForAgent={waitingForAgent}
            reviewData={reviewData}
            disabled={fetching || waitingForAgent || !session.agentPtyId}
            onClick={handleGenerateReview}
          />
          {showPushButton && (
            <button
              onClick={handlePushComments}
              disabled={pushing || unpushedCount === 0}
              className="py-1.5 px-2 text-xs rounded border border-border text-text-secondary hover:text-text-primary hover:border-accent disabled:opacity-50 transition-colors"
              title="Push comments to GitHub as draft review"
            >
              {pushing ? 'Pushing...' : `Push (${unpushedCount})`}
            </button>
          )}
        </div>
        {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
        {pushResult && <div className="text-xs text-green-400 mt-1">{pushResult}</div>}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!reviewData && (fetching || waitingForAgent) && (
          <ReviewEmptyState fetching={fetching} waitingForAgent={waitingForAgent} fetchingStatus={fetchingStatus} prBaseBranch={session.prBaseBranch} />
        )}

        {showPromo && (
          <div className="flex items-center justify-center h-full text-text-primary text-sm px-4 text-center">
            <div>
              <p className="mb-2">Click "Generate Review" to get an AI-generated structured review of this PR.</p>
              <p className="text-xs text-text-secondary">The review data will be stored in <code className="font-mono bg-bg-tertiary px-1 rounded">.broomy/</code> so your agent can reference it.</p>
            </div>
          </div>
        )}

        {showPreReview && (
          <PreReviewContent
            session={session}
            prDescription={prDescription}
            prGitHubComments={prGitHubComments}
            prCommentsLoading={prCommentsLoading}
            prCommentsHasMore={prCommentsHasMore}
            loadOlderComments={loadOlderComments}
            refreshComments={refreshComments}
            handleClickLocation={handleClickLocation}
          />
        )}

        {reviewData && (
          <ReviewContent
            reviewData={reviewData}
            comparison={comparison}
            comments={comments}
            unpushedCount={unpushedCount}
            directory={session.directory}
            prDescription={prDescription}
            prGitHubComments={prGitHubComments}
            prCommentsLoading={prCommentsLoading}
            prCommentsHasMore={prCommentsHasMore}
            onLoadOlderComments={loadOlderComments}
            onClickLocation={handleClickLocation}
            onDeleteComment={handleDeleteComment}
            repoDir={session.directory}
            prNumber={session.prNumber || 0}
            onRefreshComments={refreshComments}
          />
        )}

        <ExtendedReviewSections session={session} repo={repo} onSelectFile={onSelectFile} />
      </div>
    </div>
  )
}
