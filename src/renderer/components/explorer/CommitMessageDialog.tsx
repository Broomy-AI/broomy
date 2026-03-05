/**
 * Simple modal dialog for entering a commit message for manual (non-AI) commits.
 */
import { useState, useRef, useEffect } from 'react'

interface CommitMessageDialogProps {
  onCommit: (message: string, stageAll?: boolean) => void
  onClose: () => void
  hasStagedFiles: boolean
}

export function CommitMessageDialog({ onCommit, onClose, hasStagedFiles }: CommitMessageDialogProps) {
  const [message, setMessage] = useState('')
  const [stageAll, setStageAll] = useState(!hasStagedFiles)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = () => {
    const trimmed = message.trim()
    if (trimmed) {
      onCommit(trimmed, stageAll)
      onClose()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-bg-secondary rounded-lg shadow-xl border border-border w-full max-w-md mx-4 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-medium text-text-primary mb-2">Commit Message</h3>
        <textarea
          ref={inputRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter commit message..."
          className="w-full px-2 py-1.5 text-sm rounded bg-bg-primary border border-border text-text-primary placeholder:text-text-secondary resize-none focus:outline-none focus:border-accent"
          rows={3}
        />
        {!hasStagedFiles && (
          <div className="flex items-center gap-2 mt-2 text-xs text-yellow-400">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <span>No files are staged. All changes will be committed.</span>
          </div>
        )}
        {hasStagedFiles && (
          <label className="flex items-center gap-2 mt-2 text-xs text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={stageAll}
              onChange={(e) => setStageAll(e.target.checked)}
              className="rounded border-border"
            />
            <span>Stage all changes before committing</span>
          </label>
        )}
        <div className="flex gap-2 justify-end mt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!message.trim()}
            className="px-3 py-1.5 text-xs rounded bg-accent text-white hover:bg-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Commit
          </button>
        </div>
      </div>
    </div>
  )
}
