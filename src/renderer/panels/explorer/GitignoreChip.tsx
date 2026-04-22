/**
 * Chip that recommends setting up .broomy/.gitignore when output files are detected.
 * Clicking opens the GitignoreModal to explain why and offer to create it.
 */
import { useState, useCallback } from 'react'
import { GitignoreModal } from './tabs/review/GitignoreModal'
import { ensureOutputGitignore } from '../../features/commands/commandsConfig'

const ShieldIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)

interface GitignoreChipProps {
  directory: string
  showSuggestion: boolean
  onDismiss: () => void
}

export function GitignoreChip({ directory, showSuggestion, onDismiss }: GitignoreChipProps) {
  const [showModal, setShowModal] = useState(false)

  const handleAddToGitignore = useCallback(async () => {
    try {
      await ensureOutputGitignore(directory)
    } finally {
      setShowModal(false)
      onDismiss()
    }
  }, [directory, onDismiss])

  const handleContinueWithout = useCallback(() => {
    setShowModal(false)
    onDismiss()
  }, [onDismiss])

  if (!showSuggestion) return null

  return (
    <>
      <div className="px-3 py-1.5 border-b border-border">
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors bg-status-warning/10 text-status-warning hover:bg-status-warning/20"
          title="Set up .gitignore for Broomy output files"
        >
          <ShieldIcon />
          Add .gitignore
        </button>
      </div>
      {showModal && (
        <GitignoreModal
          onAddToGitignore={() => void handleAddToGitignore()}
          onContinueWithout={handleContinueWithout}
          onCancel={() => setShowModal(false)}
        />
      )}
    </>
  )
}
