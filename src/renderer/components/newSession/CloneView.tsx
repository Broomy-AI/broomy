import { useState } from 'react'
import { useAgentStore } from '../../store/agents'
import { useRepoStore } from '../../store/repos'

export function CloneView({
  onBack,
  onComplete,
}: {
  onBack: () => void
  onComplete: (directory: string, agentId: string | null, extra?: { repoId?: string; name?: string }) => void
}) {
  const { agents } = useAgentStore()
  const { defaultCloneDir, addRepo } = useRepoStore()

  const [url, setUrl] = useState('')
  const [location, setLocation] = useState(defaultCloneDir)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(agents[0]?.id || null)
  const [initScript, setInitScript] = useState('')
  const [showInitScript, setShowInitScript] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

      // Save managed repo with default agent
      await addRepo({
        name: repoName,
        remoteUrl,
        rootDir,
        defaultBranch,
        defaultAgentId: selectedAgentId || undefined,
      })

      // Get the repo ID that was just created
      const config = await window.config.load()
      const newRepo = config.repos?.find((r: { name: string }) => r.name === repoName)
      const repoId = newRepo?.id

      // Optionally save and run init script
      if (initScript.trim() && repoId) {
        await window.repos.saveInitScript(repoId, initScript)
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
          <div className="text-xs text-red-400 bg-red-400/10 rounded px-3 py-2 whitespace-pre-wrap">{error}</div>
        )}
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
