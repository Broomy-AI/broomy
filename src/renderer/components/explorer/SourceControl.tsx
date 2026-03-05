/**
 * Top-level source control container that composes the PR banner, view toggle, and sub-views.
 * Integrates the modular commands.json action system.
 */
import { useState, useEffect, useMemo } from 'react'
import type { GitFileStatus, GitStatusResult } from '../../../preload/index'
import type { BranchStatus, PrState } from '../../store/sessions'
import type { NavigationTarget } from '../../utils/fileNavigation'
import { useSourceControlData } from './useSourceControlData'
import { useSourceControlActions } from './useSourceControlActions'
import { SCViewToggle } from './SCViewToggle'
import { SCPrBanner } from './SCPrBanner'
import { SCCommitsView } from './SCCommitsView'
import { SCBranchView } from './SCBranchView'
import { SCWorkingView } from './SCWorkingView'
import { CommandsSetupBanner } from './CommandsSetupBanner'
import { CommandsSetupDialog } from './CommandsSetupDialog'
import { useCommandsConfig } from '../../hooks/useCommandsConfig'
import { computeConditionState } from '../../utils/conditionState'
import type { TemplateVars } from '../../utils/commandsConfig'

interface SourceControlProps {
  directory?: string
  gitStatus: GitFileStatus[]
  syncStatus?: GitStatusResult | null
  onFileSelect?: (target: NavigationTarget) => void
  onGitStatusRefresh?: () => void
  branchStatus?: BranchStatus
  repoId?: string
  agentPtyId?: string
  agentId?: string | null
  onUpdatePrState?: (prState: PrState, prNumber?: number, prUrl?: string) => void
  issueNumber?: number
  issueTitle?: string
  issueUrl?: string
  pushedToMainAt?: number
  pushedToMainCommit?: string
  onRecordPushToMain?: (commitHash: string) => void
  onClearPushToMain?: () => void
  onSwitchTab?: (tab: string) => void
  onOpenCommandsEditor?: () => void
  isReview?: boolean
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
  agentId,
  onUpdatePrState,
  issueNumber,
  issueTitle,
  issueUrl,
  pushedToMainAt,
  pushedToMainCommit,
  onRecordPushToMain,
  onClearPushToMain,
  onSwitchTab,
  onOpenCommandsEditor,
  isReview,
}: SourceControlProps) {
  const [scView, setScView] = useState<'working' | 'branch' | 'commits'>('working')
  const [showSetupDialog, setShowSetupDialog] = useState(false)
  const [noDevcontainer, setNoDevcontainer] = useState(false)

  // Load commands.json
  const { config: commandsConfig, exists: commandsExists } = useCommandsConfig(directory)

  // Reset view when directory (session) changes
  useEffect(() => {
    setScView('working')
  }, [directory])

  const data = useSourceControlData({
    directory, gitStatus, syncStatus, branchStatus, onUpdatePrState,
    pushedToMainAt, pushedToMainCommit, onClearPushToMain,
    repoId, scView,
  })

  // Check if repo has isolation enabled but no devcontainer config
  useEffect(() => {
    if (!directory || !repoId) { setNoDevcontainer(false); return }
    if (!data.currentRepo?.isolated) { setNoDevcontainer(false); return }
    let cancelled = false
    window.devcontainer.hasConfig(directory).then((has) => {
      if (!cancelled) setNoDevcontainer(!has)
    }).catch(() => {
      if (!cancelled) setNoDevcontainer(false)
    })
    return () => { cancelled = true }
  }, [directory, repoId, data.currentRepo?.isolated])

  const actions = useSourceControlActions({
    directory, onGitStatusRefresh, agentPtyId, agentId, onRecordPushToMain, data,
  })

  // Compute condition state for action button visibility
  const conditionState = useMemo(() =>
    computeConditionState({
      gitStatus,
      syncStatus,
      branchStatus,
      prNumber: data.prStatus?.number,
      hasWriteAccess: data.hasWriteAccess,
      allowPushToMain: data.currentRepo?.allowPushToMain ?? true,
      behindMainCount: data.behindMainCount,
      issueNumber,
      noDevcontainer,
      isReview,
    }),
    [gitStatus, syncStatus, branchStatus, data.prStatus, data.hasWriteAccess, data.currentRepo, data.behindMainCount, issueNumber, noDevcontainer, isReview]
  )

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
        branchBaseName={data.branchBaseName}
        gitStatus={gitStatus}
        syncStatus={syncStatus}
        isSyncingWithMain={data.isSyncingWithMain}
        onSyncWithMain={actions.handleSyncWithMain}
        gitOpError={data.gitOpError}
        onDismissError={() => data.setGitOpError(null)}
        agentMergeMessage={data.agentMergeMessage}
        onDismissAgentMerge={() => data.setAgentMergeMessage(null)}
        issueNumber={issueNumber}
        issueTitle={issueTitle}
        issueUrl={issueUrl}
        onRetryGitOp={actions.handleSync}
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
        branchBaseName={data.branchBaseName}
        stagedFiles={data.stagedFiles}
        unstagedFiles={data.unstagedFiles}
        isMerging={syncStatus?.isMerging ?? false}
        hasConflicts={syncStatus?.hasConflicts ?? false}
        isCommitting={data.isCommitting}
        onCommit={actions.handleCommit}
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

