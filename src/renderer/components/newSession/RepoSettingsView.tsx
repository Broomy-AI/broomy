import { useState, useEffect } from 'react'
import { useAgentStore } from '../../store/agents'
import { useRepoStore } from '../../store/repos'
import type { ManagedRepo } from '../../../preload/index'

export function RepoSettingsView({
  repo,
  onBack,
}: {
  repo: ManagedRepo
  onBack: () => void
}) {
  const { agents } = useAgentStore()
  const { updateRepo, removeRepo } = useRepoStore()

  const [defaultAgentId, setDefaultAgentId] = useState<string | null>(repo.defaultAgentId || null)
  const [initScript, setInitScript] = useState('')
  const [reviewInstructions, setReviewInstructions] = useState(repo.reviewInstructions || '')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Load init script
  useEffect(() => {
    const loadInitScript = async () => {
      try {
        const script = await window.repos.getInitScript(repo.id)
        setInitScript(script || '')
      } catch {
        setInitScript('')
      } finally {
        setLoading(false)
      }
    }
    loadInitScript()
  }, [repo.id])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)

    try {
      // Update repo default agent and review instructions
      await updateRepo(repo.id, {
        defaultAgentId: defaultAgentId || undefined,
        reviewInstructions: reviewInstructions || undefined,
      })

      // Save init script
      await window.repos.saveInitScript(repo.id, initScript)

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    const confirmed = await window.menu.popup([
      { id: 'delete', label: `Remove "${repo.name}" from managed repos` },
    ])
    if (confirmed === 'delete') {
      await removeRepo(repo.id)
      onBack()
    }
  }

  return (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <button onClick={onBack} className="text-text-secondary hover:text-text-primary transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h2 className="text-lg font-medium text-text-primary">Repository Settings</h2>
          <p className="text-xs text-text-secondary">{repo.name}</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-text-secondary text-sm">
            <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading...
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Repository Path</label>
              <div className="text-sm font-mono text-text-primary bg-bg-tertiary rounded px-3 py-2 truncate">
                {repo.rootDir}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Default Agent</label>
              <select
                value={defaultAgentId || ''}
                onChange={(e) => setDefaultAgentId(e.target.value || null)}
                className="w-full px-3 py-2 text-sm rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
                <option value="">Shell Only</option>
              </select>
              <p className="text-xs text-text-secondary mt-1">
                Pre-selected when creating new branches in this repo.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Init Script</label>
              <textarea
                value={initScript}
                onChange={(e) => setInitScript(e.target.value)}
                placeholder="#!/bin/bash&#10;# Runs in each new worktree&#10;cp ../main/.env .env"
                className="w-full px-3 py-2 text-xs font-mono rounded border border-border bg-bg-primary text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent resize-y"
                rows={5}
              />
              <p className="text-xs text-text-secondary mt-1">
                Script that runs in each new worktree after creation. Useful for copying config files.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Review Instructions</label>
              <textarea
                value={reviewInstructions}
                onChange={(e) => setReviewInstructions(e.target.value)}
                placeholder="Focus on: error handling, test coverage, API design..."
                className="w-full px-3 py-2 text-xs font-mono rounded border border-border bg-bg-primary text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent resize-y"
                rows={3}
              />
              <p className="text-xs text-text-secondary mt-1">
                Custom instructions included when generating AI reviews for PRs in this repo.
              </p>
            </div>

            <div className="pt-2 border-t border-border">
              <button
                onClick={handleDelete}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Remove repository from Broomy
              </button>
              <p className="text-xs text-text-secondary mt-1">
                This won't delete any files, just removes it from Broomy's managed repos list.
              </p>
            </div>
          </>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border flex justify-between items-center">
        <div className="text-xs text-green-400">
          {saved && 'Saved!'}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onBack}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 text-sm rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}
