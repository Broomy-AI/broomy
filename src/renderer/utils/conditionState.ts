/**
 * Computes the condition state used to evaluate showWhen conditions for modular actions.
 *
 * Aggregates git working tree state, branch status, PR state, and repo settings
 * into a flat boolean map that the condition evaluator uses.
 */
import type { ConditionState } from './commandsConfig'
import type { BranchStatus, PrState } from '../store/sessions'
import type { GitFileStatus, GitStatusResult } from '../../preload/index'

export interface ConditionStateInput {
  gitStatus: GitFileStatus[]
  syncStatus?: GitStatusResult | null
  branchStatus?: BranchStatus
  prState?: PrState
  prNumber?: number
  hasWriteAccess: boolean
  allowPushToMain: boolean
  behindMainCount: number
  issueNumber?: number
  noDevcontainer?: boolean
}

export function computeConditionState(input: ConditionStateInput): ConditionState {
  const {
    gitStatus,
    syncStatus,
    branchStatus,
    prNumber,
    hasWriteAccess,
    allowPushToMain,
    behindMainCount,
    issueNumber,
    noDevcontainer,
  } = input

  const hasChanges = gitStatus.length > 0
  const currentBranch = syncStatus?.current ?? ''
  const isOnMain = currentBranch === 'main' || currentBranch === 'master'
  const ahead = syncStatus?.ahead ?? 0
  const behind = syncStatus?.behind ?? 0

  return {
    'has-changes': hasChanges,
    'clean': !hasChanges,
    'merging': syncStatus?.isMerging ?? false,
    'conflicts': syncStatus?.hasConflicts ?? false,
    'no-tracking': !syncStatus?.tracking && !isOnMain && !!currentBranch,
    'ahead': ahead > 0,
    'behind': behind > 0,
    'behind-main': behindMainCount > 0,
    'on-main': isOnMain,
    'in-progress': branchStatus === 'in-progress',
    'pushed': branchStatus === 'pushed',
    'empty': branchStatus === 'empty',
    'open': branchStatus === 'open',
    'merged': branchStatus === 'merged',
    'closed': branchStatus === 'closed',
    'no-pr': !prNumber,
    'has-write-access': hasWriteAccess,
    'allow-push-to-main': allowPushToMain,
    'has-issue': !!issueNumber,
    'no-devcontainer': noDevcontainer ?? false,
  }
}
