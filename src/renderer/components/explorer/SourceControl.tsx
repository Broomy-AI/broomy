import { useState, useEffect } from 'react'
import type { GitFileStatus, GitStatusResult } from '../../../preload/index'
import type { BranchStatus, PrState } from '../../store/sessions'
import type { NavigationTarget } from '../../utils/fileNavigation'
import { useSourceControlData } from './useSourceControlData'
import { useSourceControlActions } from './useSourceControlActions'
import { SCViewToggle } from './SCViewToggle'
import { SCPrBanner } from './SCPrBanner'
import { SCCommentsView } from './SCCommentsView'
import { SCCommitsView } from './SCCommitsView'
import { SCBranchView } from './SCBranchView'
import { SCWorkingView } from './SCWorkingView'

interface SourceControlProps {
  directory?: string
  gitStatus: GitFileStatus[]
  syncStatus?: GitStatusResult | null
  onFileSelect?: (target: NavigationTarget) => void
  onGitStatusRefresh?: () => void
  branchStatus?: BranchStatus
  repoId?: string
  agentPtyId?: string
  onUpdatePrState?: (prState: PrState, prNumber?: number, prUrl?: string) => void
  pushedToMainAt?: number
  pushedToMainCommit?: string
  onRecordPushToMain?: (commitHash: string) => void
  onClearPushToMain?: () => void
  onOpenReview?: () => void
}

export function SourceControl({
  directory,
  gitStatus,
  syncStatus,
  onFileSelect,
  onGitStatusRefresh,
  branchStatus,
  repoId,
  agentPtyId,
  onUpdatePrState,
  pushedToMainAt,
  pushedToMainCommit,
  onRecordPushToMain,
  onClearPushToMain,
  onOpenReview,
}: SourceControlProps) {
  const [scView, setScView] = useState<'working' | 'branch' | 'commits' | 'comments'>('working')

  // Reset view when directory (session) changes
  useEffect(() => {
    setScView('working')
  }, [directory])

  const data = useSourceControlData({
    directory, gitStatus, syncStatus, onUpdatePrState,
    pushedToMainAt, pushedToMainCommit, onClearPushToMain,
    repoId, scView,
  })

  const actions = useSourceControlActions({
    directory, onGitStatusRefresh, agentPtyId, onRecordPushToMain, data,
  })

  if (!directory) return null

  const viewToggle = (
    <SCViewToggle scView={scView} setScView={setScView} prStatus={data.prStatus} />
  )

  const banners = (
    <SCPrBanner
      prStatus={data.prStatus}
      isPrLoading={data.isPrLoading}
      branchStatus={branchStatus}
      branchBaseName={data.branchBaseName}
      gitStatus={gitStatus}
      syncStatus={syncStatus}
      isSyncingWithMain={data.isSyncingWithMain}
      onSyncWithMain={actions.handleSyncWithMain}
      gitOpError={data.gitOpError}
      onDismissError={() => data.setGitOpError(null)}
      onFileSelect={onFileSelect}
    />
  )

  if (scView === 'comments') {
    return (
      <div className="flex flex-col h-full">
        {viewToggle}
        {banners}
        <SCCommentsView
          directory={directory}
          prComments={data.prComments}
          isCommentsLoading={data.isCommentsLoading}
          replyText={data.replyText}
          setReplyText={data.setReplyText}
          isSubmittingReply={data.isSubmittingReply}
          onReplyToComment={actions.handleReplyToComment}
          onFileSelect={onFileSelect}
        />
      </div>
    )
  }

  if (scView === 'commits') {
    return (
      <div className="flex flex-col h-full">
        {viewToggle}
        {banners}
        <SCCommitsView
          directory={directory}
          branchCommits={data.branchCommits}
          isCommitsLoading={data.isCommitsLoading}
          branchBaseName={data.branchBaseName}
          expandedCommits={data.expandedCommits}
          commitFilesByHash={data.commitFilesByHash}
          loadingCommitFiles={data.loadingCommitFiles}
          onToggleCommit={actions.handleToggleCommit}
          onFileSelect={onFileSelect}
        />
      </div>
    )
  }

  if (scView === 'branch') {
    return (
      <div className="flex flex-col h-full">
        {viewToggle}
        {banners}
        <SCBranchView
          directory={directory}
          branchChanges={data.branchChanges}
          isBranchLoading={data.isBranchLoading}
          branchBaseName={data.branchBaseName}
          branchMergeBase={data.branchMergeBase}
          onFileSelect={onFileSelect}
        />
      </div>
    )
  }

  // Working changes view
  return (
    <div className="flex flex-col h-full">
      {viewToggle}
      {banners}
      <SCWorkingView
        directory={directory}
        gitStatus={gitStatus}
        syncStatus={syncStatus}
        branchStatus={branchStatus}
        branchBaseName={data.branchBaseName}
        stagedFiles={data.stagedFiles}
        unstagedFiles={data.unstagedFiles}
        commitMessage={data.commitMessage}
        setCommitMessage={data.setCommitMessage}
        isCommitting={data.isCommitting}
        commitError={data.commitError}
        commitErrorExpanded={data.commitErrorExpanded}
        setCommitErrorExpanded={data.setCommitErrorExpanded}
        setCommitError={data.setCommitError}
        isSyncing={data.isSyncing}
        onCommit={actions.handleCommit}
        onSync={actions.handleSync}
        onPushNewBranch={actions.handlePushNewBranch}
        onStage={actions.handleStage}
        onStageAll={actions.handleStageAll}
        onUnstage={actions.handleUnstage}
        onFileSelect={onFileSelect}
        onOpenReview={onOpenReview}
        prStatus={data.prStatus}
        hasWriteAccess={data.hasWriteAccess}
        isPushingToMain={data.isPushingToMain}
        allowPushToMain={data.currentRepo?.allowPushToMain ?? true}
        onCreatePr={actions.handleCreatePr}
        onPushToMain={actions.handlePushToMain}
      />
    </div>
  )
}
