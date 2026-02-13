import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'
import { GitignoreModal } from './GitignoreModal'
import { ReviewContent } from './ReviewContent'
import { useReviewData } from './useReviewData'
import { useReviewActions } from './useReviewActions'

interface ReviewPanelProps {
  session: Session
  repo?: ManagedRepo
  onSelectFile: (filePath: string, openInDiffMode: boolean, scrollToLine?: number, diffBaseRef?: string) => void
}

export default function ReviewPanel({ session, repo, onSelectFile }: ReviewPanelProps) {
  const state = useReviewData(session.id, session.directory, session.prBaseBranch)

  const {
    reviewData,
    comments,
    comparison,
    waitingForAgent,
    pushing,
    pushResult,
    error,
    showGitignoreModal,
    unpushedCount,
  } = state

  const {
    handleGenerateReview,
    handlePushComments,
    handleDeleteComment,
    handleOpenPrUrl,
    handleClickLocation,
    handleGitignoreAdd,
    handleGitignoreContinue,
    handleGitignoreCancel,
  } = useReviewActions(session, repo, onSelectFile, state)

  return (
    <div className="h-full flex flex-col bg-bg-secondary overflow-hidden">
      {/* Gitignore Modal */}
      {showGitignoreModal && (
        <GitignoreModal
          onAddToGitignore={handleGitignoreAdd}
          onContinueWithout={handleGitignoreContinue}
          onCancel={handleGitignoreCancel}
        />
      )}

      {/* Header */}
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
          <button
            onClick={handleGenerateReview}
            disabled={waitingForAgent || !session.agentPtyId}
            className="flex-1 py-1.5 text-xs rounded bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {waitingForAgent ? (
              <span className="flex items-center justify-center gap-1.5">
                <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Waiting for agent...
              </span>
            ) : reviewData ? 'Regenerate Review' : 'Generate Review'}
          </button>
          {comments.length > 0 && session.prNumber && (
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
        {error && (
          <div className="text-xs text-red-400 mt-1">{error}</div>
        )}
        {pushResult && (
          <div className="text-xs text-green-400 mt-1">{pushResult}</div>
        )}
      </div>

      {/* Review content */}
      <div className="flex-1 overflow-y-auto">
        {!reviewData && !waitingForAgent && (
          <div className="flex items-center justify-center h-full text-text-primary text-sm px-4 text-center">
            <div>
              <p className="mb-2">Click "Generate Review" to get an AI-generated structured review of this PR.</p>
              <p className="text-xs text-text-secondary">The review data will be stored in <code className="font-mono bg-bg-tertiary px-1 rounded">.broomy/</code> so your agent can reference it.</p>
            </div>
          </div>
        )}

        {waitingForAgent && !reviewData && (
          <div className="flex items-center justify-center h-full text-text-primary px-4">
            <div className="text-center max-w-xs">
              <div className="text-sm mb-3">
                Review instructions have been pasted into your agent terminal.
              </div>
              <div className="text-sm text-text-secondary mb-4">
                Press <kbd className="px-1.5 py-0.5 rounded bg-bg-tertiary border border-border font-mono text-xs">Enter</kbd> in the agent terminal to start the review.
              </div>
              <div className="text-xs text-text-secondary">
                The review will appear here once your agent writes it to <code className="font-mono bg-bg-tertiary px-1 rounded">.broomy/review.json</code>
              </div>
            </div>
          </div>
        )}

        {reviewData && (
          <ReviewContent
            reviewData={reviewData}
            comparison={comparison}
            comments={comments}
            unpushedCount={unpushedCount}
            directory={session.directory}
            onClickLocation={handleClickLocation}
            onDeleteComment={handleDeleteComment}
          />
        )}
      </div>
    </div>
  )
}
