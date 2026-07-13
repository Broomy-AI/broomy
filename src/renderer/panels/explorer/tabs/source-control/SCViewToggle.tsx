/**
 * Toggle bar for switching between source control views: uncommitted, branch, and commits.
 */

type SCView = 'working' | 'branch' | 'commits'

interface SCViewToggleProps {
  scView: SCView
  setScView: (view: SCView) => void
}

export function SCViewToggle({ scView, setScView }: SCViewToggleProps) {
  return (
    <div className="px-3 py-1.5 border-b border-border flex items-center gap-1">
      <button
        onClick={() => setScView('working')}
        className={`px-2 py-1 text-xs rounded transition-colors ${
          scView === 'working' ? 'bg-accent text-on-accent' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
        }`}
      >
        Uncommitted
      </button>
      <button
        onClick={() => setScView('branch')}
        className={`px-2 py-1 text-xs rounded transition-colors ${
          scView === 'branch' ? 'bg-accent text-on-accent' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
        }`}
      >
        Branch
      </button>
      <button
        onClick={() => setScView('commits')}
        className={`px-2 py-1 text-xs rounded transition-colors ${
          scView === 'commits' ? 'bg-accent text-on-accent' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
        }`}
      >
        Commits
      </button>
    </div>
  )
}
