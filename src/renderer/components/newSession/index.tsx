import { useState } from 'react'
import type { View, NewSessionDialogProps } from './types'
import { HomeView } from './HomeView'
import { CloneView } from './CloneView'
import { AddExistingRepoView } from './AddExistingRepoView'
import { NewBranchView } from './NewBranchView'
import { ExistingBranchView } from './ExistingBranchView'
import { RepoSettingsView } from './RepoSettingsView'
import { IssuesView } from './IssuesView'
import { ReviewPrsView } from './ReviewPrsView'
import { AgentPickerView } from './AgentPickerView'

export function NewSessionDialog({ onComplete, onCancel }: NewSessionDialogProps) {
  const [view, setView] = useState<View>({ type: 'home' })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="bg-bg-secondary rounded-lg shadow-xl border border-border w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {view.type === 'home' && (
          <HomeView
            onClone={() => setView({ type: 'clone' })}
            onAddExistingRepo={() => setView({ type: 'add-existing-repo' })}
            onOpenFolder={async () => {
              const folderPath = await window.dialog.openFolder()
              if (folderPath) {
                setView({ type: 'agent-picker', directory: folderPath })
              }
            }}
            onNewBranch={(repo) => setView({ type: 'new-branch', repo })}
            onExistingBranch={(repo) => setView({ type: 'existing-branch', repo })}
            onRepoSettings={(repo) => setView({ type: 'repo-settings', repo })}
            onIssues={(repo) => setView({ type: 'issues', repo })}
            onReviewPrs={(repo) => setView({ type: 'review-prs', repo })}
            onOpenMain={(repo) => setView({ type: 'agent-picker', directory: repo.rootDir + '/main', repoId: repo.id, repoName: repo.name })}
            onCancel={onCancel}
          />
        )}
        {view.type === 'clone' && (
          <CloneView
            onBack={() => setView({ type: 'home' })}
            onComplete={onComplete}
          />
        )}
        {view.type === 'add-existing-repo' && (
          <AddExistingRepoView
            onBack={() => setView({ type: 'home' })}
            onComplete={onComplete}
          />
        )}
        {view.type === 'new-branch' && (
          <NewBranchView
            repo={view.repo}
            issue={view.issue}
            onBack={() => view.issue ? setView({ type: 'issues', repo: view.repo }) : setView({ type: 'home' })}
            onComplete={onComplete}
          />
        )}
        {view.type === 'existing-branch' && (
          <ExistingBranchView
            repo={view.repo}
            onBack={() => setView({ type: 'home' })}
            onComplete={onComplete}
          />
        )}
        {view.type === 'repo-settings' && (
          <RepoSettingsView
            repo={view.repo}
            onBack={() => setView({ type: 'home' })}
          />
        )}
        {view.type === 'issues' && (
          <IssuesView
            repo={view.repo}
            onBack={() => setView({ type: 'home' })}
            onSelectIssue={(issue) => setView({ type: 'new-branch', repo: view.repo, issue })}
          />
        )}
        {view.type === 'review-prs' && (
          <ReviewPrsView
            repo={view.repo}
            onBack={() => setView({ type: 'home' })}
            onComplete={onComplete}
          />
        )}
        {view.type === 'agent-picker' && (
          <AgentPickerView
            directory={view.directory}
            repoId={view.repoId}
            repoName={view.repoName}
            onBack={() => setView({ type: 'home' })}
            onComplete={onComplete}
          />
        )}
      </div>
    </div>
  )
}

export default NewSessionDialog
