/**
 * View for cloning a GitHub repository and registering it as a managed repo.
 */
import { useState, useEffect } from 'react'
import { useAgentStore } from '../../store/agents'
import { useRepoStore } from '../../store/repos'
import { DialogErrorBanner } from '../ErrorBanner'
import { AuthSetupSection } from '../AuthSetupSection'
import { IsolationSettings } from '../IsolationSettings'
import type { DevcontainerStatus } from '../../../preload/index'

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

  // Derive repo name from URL
  const repoName = url
    .replace(/\.git$/, '')
    .split('/')
    .pop()
    ?.replace(/[^a-zA-Z0-9._-]/g, '') || ''

  const handleClone = async () => {
    if (!url || !location || !repoName) return
    setLoading(true)
    setError(null)
    setNoWriteAccess(false)
    setPendingComplete(null)

    try {
      const rootDir = `${location}/${repoName}`
      const mainDir = `${rootDir}/main`

      // Clone into rootDir/main/
      const cloneResult = await window.git.clone(url, mainDir)
      if (!cloneResult.success) {
        throw new Error(cloneResult.error || 'Clone failed')
      }

      // Detect default branch and remote URL
      const defaultBranch = await window.git.defaultBranch(mainDir)
      const remoteUrl = await window.git.remoteUrl(mainDir) || url

      // Check write access to enable approve-and-merge by default
      let allowApproveAndMerge = false
      let hasWriteAccess = false
      try {
        hasWriteAccess = await window.gh.hasWriteAccess(mainDir)
        allowApproveAndMerge = hasWriteAccess
      } catch {
        // gh CLI not available or other error - default to false
      }

      if (!hasWriteAccess) {
        setNoWriteAccess(true)
      }

      // Save managed repo with default agent
      addRepo({
        name: repoName,
        remoteUrl,
        rootDir,
        defaultBranch,
        defaultAgentId: selectedAgentId || undefined,
        allowApproveAndMerge,
        isolated: isolated || undefined,
        skipApproval: skipApproval || undefined,
      })

      // Get the repo ID that was just created
      const config = await window.config.load()
      const newRepo = config.repos?.find((r: { name: string }) => r.name === repoName)
      const repoId = newRepo?.id

      // Optionally save and run init script
      if (initScript.trim() && repoId) {
        await window.repos.saveInitScript(repoId, initScript)
      }

      // If no write access, pause to show warning before completing
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
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Repository URL</label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/user/repo.git or git@github.com:user/repo.git"
            className="w-full px-3 py-2 text-sm rounded border border-border bg-bg-primary text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
            autoFocus
          />
          <p className="text-xs text-text-secondary mt-1">HTTPS (https://github.com/...) or SSH (git@github.com:...)</p>
        </div>

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
              onClick={handleBrowseLocation}
              className="px-3 py-2 text-sm rounded border border-border bg-bg-primary hover:bg-bg-tertiary text-text-secondary transition-colors"
            >
              Browse
            </button>
          </div>
        </div>

        {repoName && (
          <div className="text-xs text-text-secondary">
            Will clone to: <span className="font-mono text-text-primary">{location}/{repoName}/main/</span>
          </div>
        )}

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

        <IsolationSettings
          isolated={isolated} skipApproval={skipApproval}
          dockerStatus={null} devcontainerStatus={devcontainerStatus}
          hasDevcontainerConfig={null}
          onIsolatedChange={setIsolated} onSkipApprovalChange={setSkipApproval}
        />

        <div>
          <button
            onClick={() => setShowInitScript(!showInitScript)}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1"
          >
            <svg className={`w-3 h-3 transition-transform ${showInitScript ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Init Script
          </button>
          {showInitScript && (
            <textarea
              value={initScript}
              onChange={(e) => setInitScript(e.target.value)}
              placeholder="#!/bin/bash&#10;# Runs in each new worktree&#10;cp ../main/.env .env"
              className="w-full mt-1 px-3 py-2 text-xs font-mono rounded border border-border bg-bg-primary text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent resize-y"
              rows={3}
            />
          )}
        </div>

        {error && (
          <DialogErrorBanner error={error} onDismiss={() => setError(null)} />
        )}

        {noWriteAccess && (
          <NoWriteAccessBanner
            onContinue={pendingComplete ? () => onComplete(pendingComplete.dir, pendingComplete.agentId, pendingComplete.extra) : undefined}
          />
        )}

        <AuthSetupSection error={error} ghAvailable={ghAvailable} onRetry={handleClone} retryLabel="Retry Clone" />
      </div>

      <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleClone}
          disabled={!url || !location || !repoName || loading}
          className="px-4 py-2 text-sm rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Cloning...' : 'Clone'}
        </button>
      </div>
    </>
  )
}
