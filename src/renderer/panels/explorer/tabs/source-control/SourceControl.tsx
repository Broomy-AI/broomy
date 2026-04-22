/**
 * Top-level source control container that composes the PR banner, view toggle, and sub-views.
 * Integrates the modular commands.json action system.
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { GitFileStatus, GitStatusResult } from '../../../../../preload/index'
import type { BranchStatus, PrState, StatusChip } from '../../../../store/sessions'
import type { NavigationTarget } from '../../../../shared/utils/fileNavigation'
import { useSourceControlData } from './useSourceControlData'
import { useSourceControlActions } from './useSourceControlActions'
import { SCViewToggle } from './SCViewToggle'
import { SCPrBanner } from './SCPrBanner'
import { SCCommitsView } from './SCCommitsView'
import { SCBranchView } from './SCBranchView'
import { SCWorkingView } from './SCWorkingView'
import { CommandsSetupBanner } from './CommandsSetupBanner'
import { CommandsSetupDialog } from './CommandsSetupDialog'
import { useCommandsConfig } from '../../../../features/commands/hooks/useCommandsConfig'
import { computeConditionState } from '../../../../features/commands/conditionState'
import type { TemplateVars } from '../../../../features/commands/commandsConfig'

interface SourceControlProps {
  directory?: string
  gitStatus: GitFileStatus[]
  syncStatus?: GitStatusResult | null
  onFileSelect?: (target: NavigationTarget) => void
  onGitStatusRefresh?: () => void
  branchStatus?: BranchStatus
  statusChip?: StatusChip
  repoId?: string
  agentPtyId?: string
  agentId?: string | null
  onUpdatePrState?: (prState: PrState, prNumber?: number, prUrl?: string) => void
  onUpdateFeedbackStatus?: (hasFeedback: boolean) => void
  onUpdateChecksStatus?: (checksStatus: 'passed' | 'failed' | 'pending' | 'none') => void
  issueNumber?: number
  issueTitle?: string
  issueUrl?: string
  onSwitchTab?: (tab: string) => void
  onOpenCommandsEditor?: () => void
  isReview?: boolean
  reviewStatus?: 'pending' | 'reviewed'
  onRefreshReviewStatus?: () => void
}

export function SourceControl({
  directory,
  gitStatus,
  syncStatus,
  onFileSelect,
  onGitStatusRefresh,
  branchStatus,
  statusChip,
  repoId,
  agentPtyId,
  agentId,
  onUpdatePrState,
  onUpdateFeedbackStatus,
  onUpdateChecksStatus,
  issueNumber,
  issueTitle,
  issueUrl,
  onSwitchTab,
  onOpenCommandsEditor,
  isReview,
  reviewStatus,
  onRefreshReviewStatus,
}: SourceControlProps) {
  const [scView, setScView] = useState<'working' | 'branch' | 'commits'>('working')
  const [showSetupDialog, setShowSetupDialog] = useState(false)
  const [noDevcontainer, setNoDevcontainer] = useState(false)
  const [hasDevcontainerLoaded, setHasDevcontainerLoaded] = useState(false)

  // Load commands.json
  const { config: commandsConfig, exists: commandsExists } = useCommandsConfig(directory)

  // Reset view when directory (session) changes
  useEffect(() => {
    setScView('working')
    setHasDevcontainerLoaded(false)
  }, [directory])

  const data = useSourceControlData({
    directory, gitStatus, syncStatus, branchStatus, onUpdatePrState,
    onUpdateFeedbackStatus, onUpdateChecksStatus, repoId, scView,
  })

  // Check if repo has isolation enabled but no devcontainer config
  useEffect(() => {
    if (!directory || !repoId) { setNoDevcontainer(false); setHasDevcontainerLoaded(true); return }
    if (!data.currentRepo?.isolated) { setNoDevcontainer(false); setHasDevcontainerLoaded(true); return }
    let cancelled = false
    window.devcontainer.hasConfig(directory).then((has) => {
      if (!cancelled) { setNoDevcontainer(!has); setHasDevcontainerLoaded(true) }
    }).catch(() => {
      if (!cancelled) { setNoDevcontainer(false); setHasDevcontainerLoaded(true) }
    })
    return () => { cancelled = true }
  }, [directory, repoId, data.currentRepo?.isolated])

  const actions = useSourceControlActions({
    directory, onGitStatusRefresh, agentPtyId, agentId, data,
  })

  const handleRefresh = useCallback(() => {
    data.refreshPr()
    onRefreshReviewStatus?.()
  }, [data.refreshPr, onRefreshReviewStatus])

  // All async sources must complete before we update condition state.
  // This prevents buttons from appearing one-at-a-time as independent fetches resolve.
  const allSourcesReady = !data.isInitialLoading && hasDevcontainerLoaded

  const latestConditionState = useMemo(() =>
    computeConditionState({
      gitStatus,
      syncStatus,
      branchStatus,
      prNumber: data.prStatus?.number,
      prState: data.prStatus?.state,
      hasWriteAccess: data.hasWriteAccess,
      allowApproveAndMerge: data.currentRepo?.allowApproveAndMerge ?? true,
      checksStatus: data.checksStatus,
      behindMainCount: data.behindMainCount,
      issueNumber,
      noDevcontainer,
      isReview,
    }),
    [gitStatus, syncStatus, branchStatus, data.prStatus, data.hasWriteAccess, data.currentRepo, data.checksStatus, data.behindMainCount, issueNumber, noDevcontainer, isReview]
  )

  // Hold the last settled snapshot until all sources are ready again
  const settledConditionState = useRef(latestConditionState)
  if (allSourcesReady) {
    settledConditionState.current = latestConditionState
  }
  const conditionState = settledConditionState.current

  // Template variables for action labels and prompts
  const templateVars: TemplateVars = useMemo(() => ({
    main: data.branchBaseName || 'main',
    branch: syncStatus?.current ?? '',
    directory: directory ?? '',
    issueNumber: issueNumber ? String(issueNumber) : undefined,
  }), [data.branchBaseName, syncStatus?.current, directory, issueNumber])

  if (!directory) return null

  const viewToggle = (
    <SCViewToggle scView={scView} setScView={setScView} />
  )

  const setupDialog = showSetupDialog && directory && (
    <CommandsSetupDialog
      directory={directory}
      onClose={() => setShowSetupDialog(false)}
      onCreated={() => {/* config will auto-reload via file watcher */}}
    />
  )

  const banners = (
    <>
      {!commandsExists && (
        <CommandsSetupBanner onSetup={() => setShowSetupDialog(true)} />
      )}
      <SCPrBanner
        prStatus={data.prStatus}
        isPrLoading={data.isPrLoading}
        branchStatus={branchStatus}
        statusChip={statusChip}
        branchBaseName={data.branchBaseName}
        gitOpError={data.gitOpError}
        onDismissError={() => data.setGitOpError(null)}
        agentMergeMessage={data.agentMergeMessage}
        onDismissAgentMerge={() => data.setAgentMergeMessage(null)}
        issueNumber={issueNumber}
        issueTitle={issueTitle}
        issueUrl={issueUrl}
        onRetryGitOp={actions.handleSync}
        onFileSelect={onFileSelect}
        onRefresh={handleRefresh}
        isRefreshing={data.isPrLoading}
        reviewStatus={reviewStatus}
        isReview={isReview}
      />
    </>
  )

  if (scView === 'commits') {
    return (
      <div className="flex flex-col h-full">
        {viewToggle}
        {banners}
        {setupDialog}
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
        {setupDialog}
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
      {setupDialog}
      <SCWorkingView
        directory={directory}
        gitStatus={gitStatus}
        syncStatus={syncStatus}
        branchStatus={branchStatus}
        stagedFiles={data.stagedFiles}
        unstagedFiles={data.unstagedFiles}
        isMerging={syncStatus?.isMerging ?? false}
        hasConflicts={syncStatus?.hasConflicts ?? false}
        isCommitting={data.isCommitting}
        onCommitMerge={actions.handleCommitMerge}
        onStage={actions.handleStage}
        onStageAll={actions.handleStageAll}
        onUnstage={actions.handleUnstage}
        onFileSelect={onFileSelect}
        onSwitchTab={onSwitchTab}
        onGitStatusRefresh={onGitStatusRefresh}
        actions={commandsConfig?.actions ?? null}
        conditionState={conditionState}
        templateVars={templateVars}
        agentPtyId={agentPtyId}
        agentId={agentId}
        onOpenCommandsEditor={commandsExists ? onOpenCommandsEditor : undefined}
      />
    </div>
  )
}
