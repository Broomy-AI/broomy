import type { GitHubPrStatus } from '../../../preload/index'

type SCView = 'working' | 'branch' | 'commits' | 'comments'

interface SCViewToggleProps {
  scView: SCView
  setScView: (view: SCView) => void
  prStatus: GitHubPrStatus
}

export function SCViewToggle({ scView, setScView, prStatus }: SCViewToggleProps) {
  return (
    <div className="px-3 py-1.5 border-b border-border flex items-center gap-1">
      <button
        onClick={() => setScView('working')}
        className={`px-2 py-1 text-xs rounded transition-colors ${
          scView === 'working' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
        }`}
      >
        Uncommitted
      </button>
      <button
        onClick={() => setScView('branch')}
        className={`px-2 py-1 text-xs rounded transition-colors ${
          scView === 'branch' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
        }`}
      >
        Branch
      </button>
      <button
        onClick={() => setScView('commits')}
        className={`px-2 py-1 text-xs rounded transition-colors ${
          scView === 'commits' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
        }`}
      >
        Commits
      </button>
      {prStatus && (
        <button
          onClick={() => setScView('comments')}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            scView === 'comments' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
          }`}
        >
          Comments
        </button>
      )}
    </div>
  )
}
