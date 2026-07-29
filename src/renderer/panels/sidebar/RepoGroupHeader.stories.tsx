import type { Meta, StoryObj } from '@storybook/react'
import { RepoGroupHeader } from './RepoGroupHeader'
import { makeSession } from '../../../../.storybook/mockData'
import type { RepoGroup } from './repoGroups'
import type { MainBehind } from '../../features/git/hooks/useMainSync'

/**
 * The repo-group header row and its `main/` sync chip (#170). Each row is a full header so the
 * shot regresses the chip in context: neutral `↓N` when behind, a spinner while syncing, a muted
 * dot when the behind-check is unavailable, and nothing at all when `main/` is already current.
 */
function grp(over: Partial<RepoGroup> = {}): RepoGroup {
  return { key: 'repo:r1', label: 'my-app', kind: 'repo', repoId: 'r1', sessions: [makeSession(), makeSession()], ...over }
}

const noop = () => {}
const noopSync = () => Promise.resolve({ success: true })

const ROWS: { label: string; mainBehind?: MainBehind; isSyncing?: boolean }[] = [
  { label: 'behind (↓5)', mainBehind: { status: 'available', behind: 5 } },
  { label: 'syncing', mainBehind: { status: 'available', behind: 2 }, isSyncing: true },
  { label: 'unavailable', mainBehind: { status: 'unavailable', error: 'could not reach origin' } },
  { label: 'current (no chip)', mainBehind: { status: 'available', behind: 0 } },
]

function AllChipStates() {
  return (
    <div className="w-72 bg-bg-secondary text-text-primary p-3 flex flex-col gap-3">
      {ROWS.map((r) => (
        <div key={r.label} className="flex flex-col gap-1">
          <span className="text-3xs text-text-tertiary">{r.label}</span>
          <RepoGroupHeader
            group={grp()}
            collapsed={false}
            onToggle={noop}
            mainBehind={r.mainBehind}
            isSyncing={r.isSyncing}
            onSyncMain={noopSync}
          />
        </div>
      ))}
    </div>
  )
}

const meta: Meta<typeof AllChipStates> = {
  title: 'SessionList/RepoGroupHeader',
  component: AllChipStates,
}
export default meta
type Story = StoryObj<typeof AllChipStates>

export const MainSyncChipStates: Story = {}
