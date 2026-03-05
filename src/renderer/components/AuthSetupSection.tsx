/**
 * Shared component for handling git authentication and identity errors.
 * Shows a "Set up Git Authentication" button (or "Install GitHub CLI" if gh is not available),
 * an inline terminal for running `gh auth login`, and a retry button after auth completes.
 * Also shows an inline identity form when git identity (user.name/user.email) or merge mode
 * is not configured.
 */
import { useState } from 'react'
import { AuthTerminal } from './AuthTerminal'
import { GitIdentitySetup, isGitConfigError } from './GitIdentitySetup'
import { DialogErrorBanner } from './ErrorBanner'

export const AUTH_ERROR_MARKERS = [
  'could not authenticate',
  'Authentication failed',
  'Permission denied',
  'could not read Username',
  'terminal prompts disabled',
  'Host key verification failed',
]

export function isAuthError(error: string): boolean {
  return AUTH_ERROR_MARKERS.some((marker) => error.includes(marker))
}

export function AuthSetupSection({
  error,
  ghAvailable,
  onRetry,
  retryLabel = 'Retry',
}: {
  error: string | null
  ghAvailable: boolean | null
  onRetry: () => void
  retryLabel?: string
}) {
  const [authPtyId, setAuthPtyId] = useState<string | null>(null)
  const [authCompleted, setAuthCompleted] = useState(false)

  const showAuthButton = error && isAuthError(error) && !authPtyId

  const [setupError, setSetupError] = useState<string | null>(null)

  const handleSetupAuth = async () => {
    if (!ghAvailable) {
      await window.shell.openExternal('https://cli.github.com')
      return
    }

    try {
      setSetupError(null)
      const id = `auth-setup-${Date.now()}`
      const homedir = await window.app.homedir()
      await window.pty.create({ id, cwd: homedir })
      void window.pty.write(id, 'gh auth login\r')
      setAuthPtyId(id)
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleAuthDone = () => {
    setAuthPtyId(null)
    setAuthCompleted(true)
  }

  return (
    <>
      {showAuthButton && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleSetupAuth}
            className="px-3 py-1.5 text-xs rounded bg-yellow-600/20 text-yellow-300 hover:bg-yellow-600/30 border border-yellow-500/30 transition-colors"
          >
            {ghAvailable ? 'Set up Git Authentication' : 'Install GitHub CLI'}
          </button>
          {!ghAvailable && (
            <span className="text-xs text-text-secondary">Install GitHub CLI, then try again</span>
          )}
        </div>
      )}

      {setupError && (
        <DialogErrorBanner error={setupError} onDismiss={() => setSetupError(null)} />
      )}

      {authPtyId && (
        <AuthTerminal ptyId={authPtyId} onDone={handleAuthDone} />
      )}

      {authCompleted && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-green-400">Authentication setup complete.</span>
          <button
            onClick={onRetry}
            className="px-3 py-1.5 text-xs rounded bg-accent text-white hover:bg-accent/80 transition-colors"
          >
            {retryLabel}
          </button>
        </div>
      )}

      {error && isGitConfigError(error) && (
        <GitIdentitySetup error={error} onRetry={onRetry} retryLabel={retryLabel} />
      )}
    </>
  )
}
