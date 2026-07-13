/**
 * Compact version badge with a popover for downloading and installing app updates.
 */
import { useUpdateState } from '../shared/hooks/useUpdateState'

export default function VersionIndicator() {
  const {
    updateState, currentVersion, popoverOpen, setPopoverOpen,
    handleDownload, handleInstall,
  } = useUpdateState()

  if (!currentVersion || updateState.status === 'idle') return null

  return (
    <div className="relative">
      <button
        onClick={() => setPopoverOpen(!popoverOpen)}
        className="px-1.5 py-0.5 text-3xs font-medium rounded transition-colors bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30"
        title="Update available"
      >
        Update
        <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-accent" />
      </button>

      {popoverOpen && (
        <>
          {/* Backdrop to close popover */}
          <div className="fixed inset-0 z-40" onClick={() => setPopoverOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-bg-secondary border border-border rounded-lg shadow-xl p-3">
            <div className="text-xs text-text-secondary mb-1">Current version</div>
            <div className="text-sm font-medium text-text-primary mb-3">v{currentVersion}</div>

            {updateState.status === 'available' && (
              <>
                <div className="text-xs text-text-secondary mb-1">New version available</div>
                <div className="text-sm font-medium text-accent mb-2">v{updateState.version}</div>
                <button
                  onClick={() => window.shell.openExternal(`https://github.com/Broomy-AI/broomy/releases/tag/v${updateState.version}`)}
                  className="text-xs text-accent hover:underline mb-2 text-left"
                >
                  View changelog
                </button>
                <button
                  onClick={() => void handleDownload()}
                  className="w-full px-3 py-1.5 text-xs rounded bg-accent text-white hover:bg-accent/80 transition-colors"
                >
                  Download Update
                </button>
              </>
            )}

            {updateState.status === 'downloading' && (
              <>
                <div className="text-xs text-text-secondary mb-2">Downloading update...</div>
                <div className="w-full h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{ width: `${Math.round(updateState.percent)}%` }}
                  />
                </div>
                <div className="text-3xs text-text-tertiary mt-1 text-right">
                  {Math.round(updateState.percent)}%
                </div>
              </>
            )}

            {updateState.status === 'ready' && (
              <>
                <div className="text-xs text-text-secondary mb-2">Update downloaded. Restart to apply.</div>
                <button
                  onClick={handleInstall}
                  className="w-full px-3 py-1.5 text-xs rounded bg-accent text-white hover:bg-accent/80 transition-colors"
                >
                  Restart to Update
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
