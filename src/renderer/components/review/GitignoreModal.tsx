export function GitignoreModal({
  onAddToGitignore,
  onContinueWithout,
  onCancel,
}: {
  onAddToGitignore: () => void
  onContinueWithout: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="bg-bg-secondary rounded-lg shadow-xl border border-border w-full max-w-md mx-4 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium text-text-primary mb-2">Add .broomy to .gitignore?</h3>
        <p className="text-sm text-text-secondary mb-4">
          The <code className="font-mono bg-bg-tertiary px-1 rounded">.broomy</code> folder stores review data.
          It's recommended to add it to your <code className="font-mono bg-bg-tertiary px-1 rounded">.gitignore</code>
          so review artifacts aren't committed.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onContinueWithout}
            className="px-3 py-1.5 text-sm rounded border border-border text-text-secondary hover:text-text-primary hover:border-text-secondary transition-colors"
          >
            Continue without
          </button>
          <button
            onClick={onAddToGitignore}
            className="px-3 py-1.5 text-sm rounded bg-accent text-white hover:bg-accent/80 transition-colors"
          >
            Add to .gitignore
          </button>
        </div>
      </div>
    </div>
  )
}
