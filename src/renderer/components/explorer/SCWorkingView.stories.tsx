import type { Meta, StoryObj } from '@storybook/react'
import { SCWorkingView } from './SCWorkingView'
import type { GitFileStatus } from '../../../preload/index'

const stagedFile: GitFileStatus = { path: 'src/utils.ts', status: 'modified', staged: true, indexStatus: 'M', workingDirStatus: ' ' }
const stagedAdded: GitFileStatus = { path: 'src/new-component.tsx', status: 'added', staged: true, indexStatus: 'A', workingDirStatus: ' ' }
const unstagedFile: GitFileStatus = { path: 'src/App.tsx', status: 'modified', staged: false, indexStatus: ' ', workingDirStatus: 'M' }
const untrackedFile: GitFileStatus = { path: 'src/temp.ts', status: 'untracked', staged: false, indexStatus: '?', workingDirStatus: '?' }

const defaultConditionState = {
  'has-changes': false,
  'clean': true,
  'merging': false,
  'conflicts': false,
  'no-tracking': false,
  'ahead': false,
  'behind': false,
  'behind-main': false,
  'on-main': false,
  'in-progress': true,
  'pushed': false,
  'empty': false,
  'open': false,
  'merged': false,
  'closed': false,
  'no-pr': true,
  'has-write-access': false,
  'allow-approve-and-merge': true,
  'checks-passed': false,
  'has-issue': false,
  'no-devcontainer': false,
  'review': false,
}

const meta: Meta<typeof SCWorkingView> = {
  title: 'Explorer/SCWorkingView',
  component: SCWorkingView,
  args: {
    directory: '/Users/test/projects/my-app',
    gitStatus: [],
    syncStatus: { files: [], ahead: 0, behind: 0, tracking: 'origin/main', current: 'feature/test', isMerging: false, hasConflicts: false },
    branchStatus: 'in-progress',
    branchBaseName: 'main',
    stagedFiles: [],
    unstagedFiles: [],
    isMerging: false,
    hasConflicts: false,
    isCommitting: false,
    onCommit: () => {},
    onCommitMerge: () => {},
    onStage: () => {},
    onStageAll: () => {},
    onUnstage: () => {},
    onFileSelect: () => {},
    onSwitchTab: () => {},
    onGitStatusRefresh: () => {},
    actions: null,
    conditionState: defaultConditionState,
    templateVars: { main: 'main', branch: 'feature/test', directory: '/Users/test/projects/my-app' },
  },
}
export default meta
type Story = StoryObj<typeof SCWorkingView>

export const Clean: Story = {
  args: {},
}

export const StagedOnly: Story = {
  args: {
    gitStatus: [stagedFile, stagedAdded],
    stagedFiles: [stagedFile, stagedAdded],
    unstagedFiles: [],
    conditionState: { ...defaultConditionState, 'has-changes': true, 'clean': false },
  },
}

export const UnstagedOnly: Story = {
  args: {
    gitStatus: [unstagedFile, untrackedFile],
    stagedFiles: [],
    unstagedFiles: [unstagedFile, untrackedFile],
    conditionState: { ...defaultConditionState, 'has-changes': true, 'clean': false },
  },
}

export const Mixed: Story = {
  args: {
    gitStatus: [stagedFile, stagedAdded, unstagedFile, untrackedFile],
    stagedFiles: [stagedFile, stagedAdded],
    unstagedFiles: [unstagedFile, untrackedFile],
    conditionState: { ...defaultConditionState, 'has-changes': true, 'clean': false },
  },
}

export const Merging: Story = {
  args: {
    gitStatus: [unstagedFile],
    stagedFiles: [],
    unstagedFiles: [unstagedFile],
    isMerging: true,
    hasConflicts: true,
    syncStatus: { files: [], ahead: 0, behind: 0, tracking: 'origin/main', current: 'feature/test', isMerging: true, hasConflicts: true },
    conditionState: { ...defaultConditionState, 'has-changes': true, 'clean': false, 'merging': true, 'conflicts': true },
  },
}

export const MergeResolved: Story = {
  args: {
    gitStatus: [stagedFile],
    stagedFiles: [stagedFile],
    unstagedFiles: [],
    isMerging: true,
    hasConflicts: false,
    syncStatus: { files: [], ahead: 0, behind: 0, tracking: 'origin/main', current: 'feature/test', isMerging: true, hasConflicts: false },
    conditionState: { ...defaultConditionState, 'has-changes': true, 'clean': false, 'merging': true },
  },
}

export const Ahead: Story = {
  args: {
    syncStatus: { files: [], ahead: 3, behind: 0, tracking: 'origin/feature/test', current: 'feature/test', isMerging: false, hasConflicts: false },
    conditionState: { ...defaultConditionState, 'ahead': true },
  },
}

export const Behind: Story = {
  args: {
    syncStatus: { files: [], ahead: 0, behind: 5, tracking: 'origin/feature/test', current: 'feature/test', isMerging: false, hasConflicts: false },
    conditionState: { ...defaultConditionState, 'behind': true },
  },
}
