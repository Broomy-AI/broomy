/**
 * View for cloning a GitHub repository and registering it as a managed repo.
 */
import { useState, useEffect } from 'react'
import { useAgentStore } from '../../../store/agents'
import { useRepoStore } from '../../../store/repos'
import { DialogErrorBanner } from '../../../shared/components/ErrorBanner'
import { AuthSetupSection } from '../../../shared/components/AuthSetupSection'
import { IsolationSettings } from '../../../shared/components/IsolationSettings'
import type { DevcontainerStatus, AgentData } from '../../../../preload/index'
import { parseCloneUrl, type ParsedCloneUrl } from './cloneUrl'
import { useLocationStatus, type LocationStatus } from './useLocationStatus'

function NoWriteAccessBanner({ onContinue }: { onContinue?: () => void }) {
  return (
    <div className="rounded border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-text-primary">
      <div className="font-medium text-yellow-400">No write access</div>
      <p className="text-xs text-text-secondary mt-1">
        You don't have push access to this repository. You won't be able to create branches or push changes.
        Consider forking the repo on GitHub and cloning your fork instead.
      </p>
      {onContinue && (
        <button
          onClick={onContinue}
          className="mt-2 px-3 py-1.5 text-xs rounded border border-yellow-500/30 bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 transition-colors"
        >
          Continue anyway (read-only)
        </button>
      )}
    </div>
  )
}

function UrlField({
  url, setUrl, parsed, onSubmit,
}: {
  url: string
  setUrl: (v: string) => void
  parsed: ParsedCloneUrl
  onSubmit: () => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1">Repository URL</label>
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onSubmit()
          }
        }}
        placeholder="https://github.com/user/repo.git or git@github.com:user/repo.git"
        className="w-full px-3 py-2 text-sm rounded border border-border bg-bg-primary text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
        autoFocus
      />
      {url.trim() && parsed.error ? (
        <p className="text-xs text-red-400 mt-1">{parsed.error}</p>
      ) : (
        <p className="text-xs text-text-secondary mt-1">HTTPS (https://github.com/...), SSH (git@github.com:...), or owner/repo</p>
      )}
    </div>
  )
}

function LocationField({
  location, setLocation, status, repoName, onBrowse,
}: {
  location: string
  setLocation: (v: string) => void
  status: LocationStatus
  repoName: string
  onBrowse: () => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1">Location</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="flex-1 px-3 py-2 text-sm rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
        />
        <button
          onClick={onBrowse}
          className="px-3 py-2 text-sm rounded border border-border bg-bg-primary hover:bg-bg-tertiary text-text-secondary transition-colors"
        >
          Browse
        </button>
      </div>
      {status.kind === 'will-create' && (
        <p className="text-xs text-text-secondary mt-1">
          <span className="text-yellow-400">⚠</span> This folder doesn't exist yet — it will be created.
        </p>
      )}
      {status.kind === 'target-exists' && (
        <p className="text-xs text-red-400 mt-1">
          A folder named "{repoName}" already exists here. Pick a different location or remove the existing folder.
        </p>
      )}
    </div>
  )
}

function PathPreview({ path }: { path: string }) {
  return (
    <div className="text-xs text-text-secondary">
      Will clone to: <span className="font-mono text-text-primary">{path}</span>
      <span className="text-text-secondary" title="Broomy keeps the main checkout in a 'main/' subfolder so additional worktrees (parallel branches) can sit alongside it.">
        {' '}<span className="underline decoration-dotted cursor-help">Why /main/?</span>
      </span>
    </div>
  )
}

function AgentField({
  agents, selectedAgentId, setSelectedAgentId,
}: {
  agents: AgentData[]
  selectedAgentId: string | null
  setSelectedAgentId: (id: string | null) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1">Agent</label>
      <select
        value={selectedAgentId || ''}
        onChange={(e) => setSelectedAgentId(e.target.value || null)}
        className="w-full px-3 py-2 text-sm rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
      >
        {agents.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
        <option value="">Shell Only</option>
      </select>
    </div>
  )
}

function InitScriptField({
  initScript, setInitScript, show, setShow,
}: {
  initScript: string
  setInitScript: (v: string) => void
  show: boolean
  setShow: (v: boolean) => void
}) {
  return (
    <div>
      <button
        onClick={() => setShow(!show)}
        className="text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1"
      >
        <svg className={`w-3 h-3 transition-transform ${show ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Init Script
      </button>
      {show && (
        <textarea
          value={initScript}
          onChange={(e) => setInitScript(e.target.value)}
          placeholder="#!/bin/bash&#10;# Runs in each new worktree&#10;cp ../main/.env .env"
          className="w-full mt-1 px-3 py-2 text-xs font-mono rounded border border-border bg-bg-primary text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent resize-y"
          rows={3}
        />
      )}
    </div>
  )
}

function CloneFooter({
  blockingReason, canClone, loading, onBack, onClone,
}: {
  blockingReason: string | null
  canClone: boolean
  loading: boolean
  onBack: () => void
  onClone: () => void
}) {
  return (
    <div className="px-4 py-3 border-t border-border">
      {blockingReason && (
        <p className="text-xs text-text-secondary mb-2 text-right">{blockingReason}</p>
      )}
      <div className="flex justify-end gap-2">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onClone}
          disabled={!canClone}
          className="px-4 py-2 text-sm rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Cloning...' : 'Clone'}
        </button>
      </div>
    </div>
  )
}

function computeBlockingReason(args: {
  loading: boolean
  url: string
  parsed: ParsedCloneUrl
  cleanedLocation: string
  repoName: string
  status: LocationStatus
}): string | null {
  const { loading, url, parsed, cleanedLocation, repoName, status } = args
  if (loading) return null
  if (!url.trim()) return 'Enter a repository URL to continue.'
  if (parsed.error) return parsed.error
  if (!repoName) return 'Could not derive a folder name from this URL.'
  if (!cleanedLocation) return 'Choose a location to clone into.'
  if (status.kind === 'target-exists') {
    return `A folder named "${repoName}" already exists at this location. Pick a different location or remove the existing folder.`
  }
  return null
}

export function CloneView({
  onBack,
  onComplete,
}: {
  onBack: () => void
  onComplete: (directory: string, agentId: string | null, extra?: { repoId?: string; name?: string }) => void
}) {
  const { agents } = useAgentStore()
  const { defaultCloneDir, addRepo, ghAvailable } = useRepoStore()

  const [url, setUrl] = useState('')
  const [location, setLocation] = useState(defaultCloneDir)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(agents[0]?.id || null)
  const [initScript, setInitScript] = useState('')
  const [showInitScript, setShowInitScript] = useState(false)
  const [isolated, setIsolated] = useState(false)
  const [skipApproval, setSkipApproval] = useState(false)
  const [devcontainerStatus, setDevcontainerStatus] = useState<DevcontainerStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noWriteAccess, setNoWriteAccess] = useState(false)
  const [pendingComplete, setPendingComplete] = useState<{ dir: string; agentId: string | null; extra: { repoId?: string; name?: string } } | null>(null)

  useEffect(() => {
    if (isolated) {
      void window.devcontainer.status().then(setDevcontainerStatus).catch(() => setDevcontainerStatus({ available: false, error: 'Failed to check devcontainer status' }))
    }
  }, [isolated])

  const parsed = parseCloneUrl(url)
  const repoName = parsed.repoName
  const cleanedLocation = location.trim().replace(/\/+$/, '')
  const previewRepoName = repoName || '<repo>'
  const previewPath = cleanedLocation
    ? `${cleanedLocation}/${previewRepoName}/main/`
    : `<location>/${previewRepoName}/main/`
  const locationStatus = useLocationStatus(cleanedLocation, repoName)
  const blockingReason = computeBlockingReason({ loading, url, parsed, cleanedLocation, repoName, status: locationStatus })
  const canClone = blockingReason === null && !loading

  const handleClone = async () => {
    if (!canClone) return
    setLoading(true)
    setError(null)
    setNoWriteAccess(false)
    setPendingComplete(null)

    try {
      const rootDir = `${cleanedLocation}/${repoName}`
      const mainDir = `${rootDir}/main`

      const cloneResult = await window.git.clone(parsed.url, mainDir)
      if (!cloneResult.success) {
        throw new Error(cloneResult.error || 'Clone failed')
      }

      const defaultBranch = await window.git.defaultBranch(mainDir)
      const remoteUrl = await window.git.remoteUrl(mainDir) || parsed.url

      let hasWriteAccess = false
      try {
        hasWriteAccess = await window.gh.hasWriteAccess(mainDir)
      } catch {
        // gh CLI not available or other error - default to false
      }

      if (!hasWriteAccess) {
        setNoWriteAccess(true)
      }

      addRepo({
        name: repoName,
        remoteUrl,
        rootDir,
        defaultBranch,
        defaultAgentId: selectedAgentId || undefined,
        allowApproveAndMerge: hasWriteAccess,
        isolated: isolated || undefined,
        skipApproval: skipApproval || undefined,
      })

      const config = await window.config.load()
      const newRepo = config.repos?.find((r: { name: string }) => r.name === repoName)
      const repoId = newRepo?.id

      if (initScript.trim() && repoId) {
        await window.repos.saveInitScript(repoId, initScript)
      }

      if (!hasWriteAccess) {
        setPendingComplete({ dir: mainDir, agentId: selectedAgentId, extra: { repoId, name: repoName } })
        return
      }

      onComplete(mainDir, selectedAgentId, { repoId, name: repoName })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleBrowseLocation = async () => {
    const folder = await window.dialog.openFolder()
    if (folder) setLocation(folder)
  }

  const triggerCloneFromKey = () => {
    if (canClone) void handleClone()
  }

  return (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <button onClick={onBack} className="text-text-secondary hover:text-text-primary transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-lg font-medium text-text-primary">Clone Repository</h2>
      </div>

      <div className="p-4 space-y-3">
        <UrlField url={url} setUrl={setUrl} parsed={parsed} onSubmit={triggerCloneFromKey} />
        <LocationField location={location} setLocation={setLocation} status={locationStatus} repoName={repoName} onBrowse={() => void handleBrowseLocation()} />
        <PathPreview path={previewPath} />
        <AgentField agents={agents} selectedAgentId={selectedAgentId} setSelectedAgentId={setSelectedAgentId} />
        <IsolationSettings
          isolated={isolated} skipApproval={skipApproval}
          dockerStatus={null} devcontainerStatus={devcontainerStatus}
          hasDevcontainerConfig={null}
          onIsolatedChange={setIsolated} onSkipApprovalChange={setSkipApproval}
        />
        <InitScriptField initScript={initScript} setInitScript={setInitScript} show={showInitScript} setShow={setShowInitScript} />
        {error && <DialogErrorBanner error={error} onDismiss={() => setError(null)} />}
        {noWriteAccess && (
          <NoWriteAccessBanner
            onContinue={pendingComplete ? () => onComplete(pendingComplete.dir, pendingComplete.agentId, pendingComplete.extra) : undefined}
          />
        )}
        <AuthSetupSection error={error} ghAvailable={ghAvailable} onRetry={handleClone} retryLabel="Retry Clone" />
      </div>

      <CloneFooter
        blockingReason={blockingReason}
        canClone={canClone}
        loading={loading}
        onBack={onBack}
        onClone={() => void handleClone()}
      />
    </>
  )
}
