/**
 * Toolbar configuration overlay for adding, removing, and reordering panel buttons.
 *
 * Displays all registered panels split into two sections: those currently in the toolbar
 * (with drag-to-reorder and move up/down buttons) and available panels not yet added.
 * The first N panels in the toolbar receive keyboard shortcut badges (Cmd+1 through Cmd+N).
 * Changes are persisted immediately via the onToolbarPanelsChange callback.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { usePanelRegistry, MAX_SHORTCUT_PANELS } from '../panels'
import type { PanelDefinition } from '../panels'

interface PanelPickerProps {
  toolbarPanels: string[]
  onToolbarPanelsChange: (panels: string[]) => void
  onClose: () => void
}

// Detect if we're on Mac for keyboard shortcut display
const isMac = navigator.userAgent.includes('Mac')
const formatShortcut = (key: string) => {
  const modifier = isMac ? '⌘' : 'Ctrl+'
  return `${modifier}${key}`
}

function ToolbarPanelRow({
  panel,
  index,
  totalCount,
  isDragOver,
  isDragged,
  onDragStart,
  onDragOver,
  onDragEnd,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  panel: PanelDefinition
  index: number
  totalCount: number
  isDragOver: boolean
  isDragged: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnd: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
  const shortcutKey = index < MAX_SHORTCUT_PANELS ? String(index + 1) : null

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-2 px-2 py-2 rounded hover:bg-bg-tertiary cursor-move group ${
        isDragOver ? 'bg-accent/20' : ''
      } ${isDragged ? 'opacity-50' : ''}`}
    >
      {/* Drag handle */}
      <div className="text-text-secondary opacity-50 group-hover:opacity-100">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="2" />
          <circle cx="15" cy="6" r="2" />
          <circle cx="9" cy="12" r="2" />
          <circle cx="15" cy="12" r="2" />
          <circle cx="9" cy="18" r="2" />
          <circle cx="15" cy="18" r="2" />
        </svg>
      </div>

      {/* Icon */}
      <span className="text-text-secondary">{panel.icon}</span>

      {/* Name */}
      <span className="flex-1 text-sm text-text-primary">{panel.name}</span>

      {/* Shortcut badge */}
      {shortcutKey && (
        <span className="text-xs px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary">
          {formatShortcut(shortcutKey)}
        </span>
      )}

      {/* Move buttons */}
      <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onMoveUp() }}
          disabled={index === 0}
          className="p-0.5 text-text-secondary hover:text-text-primary disabled:opacity-30"
          title="Move up"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMoveDown() }}
          disabled={index === totalCount - 1}
          className="p-0.5 text-text-secondary hover:text-text-primary disabled:opacity-30"
          title="Move down"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Remove button */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        className="p-0.5 text-text-secondary hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Remove from toolbar"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}

export default function PanelPicker({
  toolbarPanels,
  onToolbarPanelsChange,
  onClose,
}: PanelPickerProps) {
  const registry = usePanelRegistry()
  const allPanels = registry.getAll()
  const [draggedPanel, setDraggedPanel] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const isInToolbar = (panelId: string) => toolbarPanels.includes(panelId)

  const toggleInToolbar = useCallback((panelId: string) => {
    if (isInToolbar(panelId)) {
      onToolbarPanelsChange(toolbarPanels.filter(id => id !== panelId))
    } else {
      onToolbarPanelsChange([...toolbarPanels, panelId])
    }
  }, [toolbarPanels, onToolbarPanelsChange])

  const handleDragStart = useCallback((e: React.DragEvent, panelId: string) => {
    setDraggedPanel(panelId)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }, [])

  const handleDragEnd = useCallback(() => {
    if (draggedPanel !== null && dragOverIndex !== null) {
      const currentIndex = toolbarPanels.indexOf(draggedPanel)
      if (currentIndex !== -1 && currentIndex !== dragOverIndex) {
        const newPanels = [...toolbarPanels]
        newPanels.splice(currentIndex, 1)
        newPanels.splice(dragOverIndex, 0, draggedPanel)
        onToolbarPanelsChange(newPanels)
      }
    }
    setDraggedPanel(null)
    setDragOverIndex(null)
  }, [draggedPanel, dragOverIndex, toolbarPanels, onToolbarPanelsChange])

  const moveUp = useCallback((panelId: string) => {
    const index = toolbarPanels.indexOf(panelId)
    if (index > 0) {
      const newPanels = [...toolbarPanels]
      newPanels.splice(index, 1)
      newPanels.splice(index - 1, 0, panelId)
      onToolbarPanelsChange(newPanels)
    }
  }, [toolbarPanels, onToolbarPanelsChange])

  const moveDown = useCallback((panelId: string) => {
    const index = toolbarPanels.indexOf(panelId)
    if (index < toolbarPanels.length - 1) {
      const newPanels = [...toolbarPanels]
      newPanels.splice(index, 1)
      newPanels.splice(index + 1, 0, panelId)
      onToolbarPanelsChange(newPanels)
    }
  }, [toolbarPanels, onToolbarPanelsChange])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end pt-12 pr-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Menu */}
      <div
        ref={containerRef}
        className="relative bg-bg-secondary rounded-lg shadow-xl border border-border w-72 max-h-96 overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium text-text-primary">Configure Toolbar</h3>
          <p className="text-xs text-text-secondary mt-1">
            Drag to reorder. First {MAX_SHORTCUT_PANELS} get keyboard shortcuts.
          </p>
        </div>

        {/* Panel list */}
        <div className="flex-1 overflow-y-auto">
          {/* Toolbar panels (ordered) */}
          <div className="px-2 py-2">
            <div className="text-xs font-medium text-text-secondary px-2 py-1">In Toolbar</div>
            {toolbarPanels.map((panelId, index) => {
              const panel = registry.get(panelId)
              if (!panel) return null

              return (
                <ToolbarPanelRow
                  key={panelId}
                  panel={panel}
                  index={index}
                  totalCount={toolbarPanels.length}
                  isDragOver={dragOverIndex === index}
                  isDragged={draggedPanel === panelId}
                  onDragStart={(e) => handleDragStart(e, panelId)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  onMoveUp={() => moveUp(panelId)}
                  onMoveDown={() => moveDown(panelId)}
                  onRemove={() => toggleInToolbar(panelId)}
                />
              )
            })}
            {toolbarPanels.length === 0 && (
              <div className="text-sm text-text-secondary px-2 py-2 italic">
                No panels in toolbar
              </div>
            )}
          </div>

          {/* Available panels (not in toolbar) */}
          {allPanels.filter(p => !isInToolbar(p.id)).length > 0 && (
            <div className="px-2 py-2 border-t border-border">
              <div className="text-xs font-medium text-text-secondary px-2 py-1">Available</div>
              {allPanels
                .filter(panel => !isInToolbar(panel.id))
                .map(panel => (
                  <div
                    key={panel.id}
                    className="flex items-center gap-2 px-2 py-2 rounded hover:bg-bg-tertiary cursor-pointer group"
                    onClick={() => toggleInToolbar(panel.id)}
                  >
                    {/* Placeholder for drag handle alignment */}
                    <div className="w-3" />

                    {/* Icon */}
                    <span className="text-text-secondary">{panel.icon}</span>

                    {/* Name */}
                    <span className="flex-1 text-sm text-text-primary">{panel.name}</span>

                    {/* Add button */}
                    <button
                      className="p-0.5 text-text-secondary hover:text-green-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Add to toolbar"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border">
          <button
            onClick={onClose}
            className="w-full px-3 py-1.5 text-sm rounded bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
