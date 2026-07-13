/**
 * Inline form for configuring git identity (user.name, user.email) and default merge mode.
 * Shown when git operations fail with "Please tell me who you are" or similar identity errors.
 */
import { useState, useEffect } from 'react'

export const IDENTITY_ERROR_MARKERS = [
  'Please tell me who you are',
  'Author identity unknown',
  'empty ident name',
  'user.useConfigOnly',
  'need to resolve your current index first',
]

const MERGE_MODE_ERROR_MARKERS = [
  'Need to specify how to reconcile divergent branches',
  'pull.rebase',
  'pull.ff',
]

export function isIdentityError(error: string): boolean {
  return IDENTITY_ERROR_MARKERS.some((marker) => error.includes(marker))
}

export function isMergeModeError(error: string): boolean {
  return MERGE_MODE_ERROR_MARKERS.some((marker) => error.includes(marker))
}

export function isGitConfigError(error: string): boolean {
  return isIdentityError(error) || isMergeModeError(error)
}

export function GitIdentitySetup({
  error,
  onRetry,
  retryLabel = 'Retry',
}: {
  error: string | null
  onRetry: () => void
  retryLabel?: string
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const showIdentity = error ? isIdentityError(error) : false
  const showMergeMode = error ? isMergeModeError(error) : false

  // Pre-populate from existing global config
  useEffect(() => {
    if (!showIdentity) return
    // Use any repo path — getConfig reads global config as fallback
    void window.git.getConfig('.', 'user.name').then((v) => { if (v) setName(v) })
    void window.git.getConfig('.', 'user.email').then((v) => { if (v) setEmail(v) })
  }, [showIdentity])

  if (!showIdentity && !showMergeMode) return null

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)

    try {
      if (showIdentity) {
        if (!name.trim() || !email.trim()) {
          setSaveError('Name and email are required.')
          setSaving(false)
          return
        }

        const nameResult = await window.git.setGlobalConfig('user.name', name.trim())
        if (!nameResult.success) throw new Error(nameResult.error || 'Failed to set user.name')

        const emailResult = await window.git.setGlobalConfig('user.email', email.trim())
        if (!emailResult.success) throw new Error(emailResult.error || 'Failed to set user.email')
      }

      if (showMergeMode || showIdentity) {
        // Always set a sensible default merge mode alongside identity
        const mergeResult = await window.git.setGlobalConfig('pull.rebase', 'false')
        if (!mergeResult.success) throw new Error(mergeResult.error || 'Failed to set pull.rebase')
      }

      setSaved(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-success-fg">
          {showIdentity ? 'Git identity configured.' : 'Default merge mode configured.'}
        </span>
        <button
          onClick={onRetry}
          className="px-3 py-1.5 text-xs rounded bg-accent text-white hover:bg-accent/80 transition-colors"
        >
          {retryLabel}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-warning-soft">
        {showIdentity
          ? 'Git identity not configured. Enter your name and email to continue.'
          : 'Git default merge mode not configured.'}
      </p>

      {showIdentity && (
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your Name"
            className="flex-1 px-2 py-1.5 text-xs rounded border border-border bg-bg-primary text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="flex-1 px-2 py-1.5 text-xs rounded border border-border bg-bg-primary text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
          />
        </div>
      )}

      {saveError && (
        <p className="text-xs text-danger-fg">{saveError}</p>
      )}

      <button
        onClick={handleSave}
        disabled={saving || (showIdentity && (!name.trim() || !email.trim()))}
        className="px-3 py-1.5 text-xs rounded bg-warning-solid/20 text-warning-soft hover:bg-warning-solid/30 border border-warning-base/30 transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving...' : showIdentity ? 'Save Git Identity' : 'Set Default Merge Mode'}
      </button>
    </div>
  )
}
