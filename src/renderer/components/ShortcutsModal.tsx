interface ShortcutsModalProps {
  onClose: () => void
}

// Detect if we're on Mac for keyboard shortcut display
const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
const modKey = isMac ? 'Cmd' : 'Ctrl'

interface ShortcutGroup {
  title: string
  shortcuts: { label: string; keys: string }[]
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Panel Shortcuts',
    shortcuts: [
      { label: 'Toggle Sessions', keys: `${modKey}+1` },
      { label: 'Toggle Explorer', keys: `${modKey}+2` },
      { label: 'Toggle File Viewer', keys: `${modKey}+3` },
      { label: 'Toggle Agent', keys: `${modKey}+4` },
      { label: 'Toggle Terminal', keys: `${modKey}+5` },
      { label: 'Toggle Guide', keys: `${modKey}+6` },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { label: 'Cycle Panels Forward', keys: 'Ctrl+Tab' },
      { label: 'Cycle Panels Backward', keys: 'Ctrl+Shift+Tab' },
    ],
  },
  {
    title: 'File Operations',
    shortcuts: [
      { label: 'Save File', keys: `${modKey}+S` },
      { label: 'Search Files', keys: `${modKey}+P` },
    ],
  },
  {
    title: 'Debug',
    shortcuts: [
      { label: 'Copy Terminal + Session Info', keys: `${modKey}+Shift+C` },
    ],
  },
]

export default function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bg-secondary border border-border rounded-lg shadow-xl w-[500px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-medium text-text-primary">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {shortcutGroups.map((group) => (
            <section key={group.title}>
              <h3 className="text-sm font-medium text-text-primary mb-3">{group.title}</h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.label} className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">{shortcut.label}</span>
                    <kbd className="px-2 py-1 text-xs rounded bg-bg-tertiary text-text-primary font-mono">
                      {shortcut.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded bg-accent text-white hover:bg-accent/90 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
