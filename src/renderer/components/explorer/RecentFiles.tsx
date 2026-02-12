export function RecentFiles({
  recentFiles,
  onFileSelect,
  selectedFilePath,
  directory,
}: {
  recentFiles: string[]
  onFileSelect?: (filePath: string, openInDiffMode: boolean) => void
  selectedFilePath?: string | null
  directory?: string
}) {
  // Tree keyboard navigation helper
  const navigateTreeItem = (current: HTMLElement, direction: 'up' | 'down') => {
    const container = current.closest('[data-panel-id]')
    if (!container) return
    const items = Array.from(container.querySelectorAll('[data-tree-item]')) as HTMLElement[]
    const idx = items.indexOf(current)
    const target = direction === 'down' ? items[idx + 1] : items[idx - 1]
    if (target) target.focus()
  }

  if (recentFiles.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">
        No recently opened files
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto text-sm">
      {recentFiles.map((filePath) => {
        const name = filePath.split('/').pop() || filePath
        const relativePath = directory ? filePath.replace(directory + '/', '') : filePath
        const isSelected = filePath === selectedFilePath

        return (
          <div
            key={filePath}
            data-tree-item
            tabIndex={0}
            onClick={() => onFileSelect?.(filePath, false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onFileSelect?.(filePath, false)
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                navigateTreeItem(e.currentTarget as HTMLElement, 'down')
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                navigateTreeItem(e.currentTarget as HTMLElement, 'up')
              }
            }}
            className={`flex items-center gap-2 px-3 py-1 cursor-pointer outline-none focus:bg-accent/15 ${
              isSelected ? 'bg-accent/20' : 'hover:bg-bg-tertiary'
            }`}
            title={relativePath}
          >
            <span className="w-4" />
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs text-text-primary truncate">{name}</span>
              <span className="text-[10px] text-text-secondary truncate">{relativePath}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
