/**
 * Tab bar for switching between agent and user terminal tabs within a session.
 */
import type { TerminalTab } from '../store/sessions'

// Inline SVG icons
const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const XIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const ChevronDownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

interface TerminalTabBarProps {
  tabs: TerminalTab[]
  activeTabId: string | null
  editingTabId: string | null
  editingName: string
  dragOverTabId: string | null
  isOverflowing: boolean
  showDropdown: boolean
  agentTabId?: string
  fixedTabIds?: Set<string>
  handleTabClick: (tabId: string) => void
  handleCloseTab: (e: React.MouseEvent, tabId: string) => void
  handleContextMenu: (e: React.MouseEvent, tabId: string) => void
  handleDoubleClick: (tabId: string) => void
  handleDragStart: (e: React.DragEvent, tabId: string) => void
  handleDragEnd: (e: React.DragEvent) => void
  handleDragOver: (e: React.DragEvent, tabId: string) => void
  handleDragLeave: () => void
  handleDrop: (e: React.DragEvent, tabId: string) => void
  handleRenameSubmit: () => void
  handleRenameKeyDown: (e: React.KeyboardEvent) => void
  handleDropdownSelect: (tabId: string) => void
  handleAddTab: () => void
  setEditingName: (name: string) => void
  setShowDropdown: (show: boolean) => void
  editInputRef: React.RefObject<HTMLInputElement>
  dropdownRef: React.RefObject<HTMLDivElement>
  tabsContainerRef: React.RefObject<HTMLDivElement>
}

export default function TerminalTabBar({
  tabs,
  activeTabId,
  editingTabId,
  editingName,
  dragOverTabId,
  isOverflowing,
  showDropdown,
  agentTabId,
  fixedTabIds,
  handleTabClick,
  handleCloseTab,
  handleContextMenu,
  handleDoubleClick,
  handleDragStart,
  handleDragEnd,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleRenameSubmit,
  handleRenameKeyDown,
  handleDropdownSelect,
  handleAddTab,
  setEditingName,
  setShowDropdown,
  editInputRef,
  dropdownRef,
  tabsContainerRef,
}: TerminalTabBarProps) {
  return (
    <div className="flex items-center h-6 flex-shrink-0 bg-bg-primary">
      {/* Tabs container */}
      <div ref={tabsContainerRef} role="tablist" aria-label="Terminal tabs" className="flex-1 flex items-center overflow-x-auto scrollbar-thin min-w-0 gap-1 px-1">
        {tabs.map((tab) => {
          const isAgent = tab.id === agentTabId || (fixedTabIds?.has(tab.id) ?? false)
          return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeTabId}
            className={`
              group flex items-center gap-1 px-2 h-6 cursor-pointer
              transition-colors duration-100 select-none min-w-0 text-xs
              ${tab.id === activeTabId
                ? 'text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
              }
              ${dragOverTabId === tab.id ? 'border-l-2 border-l-accent' : ''}
            `}
            draggable={!isAgent && editingTabId !== tab.id}
            onClick={() => handleTabClick(tab.id)}
            onContextMenu={isAgent ? undefined : (e) => handleContextMenu(e, tab.id)}
            onDoubleClick={isAgent ? undefined : () => handleDoubleClick(tab.id)}
            onDragStart={isAgent ? undefined : (e) => handleDragStart(e, tab.id)}
            onDragEnd={isAgent ? undefined : handleDragEnd}
            onDragOver={isAgent ? undefined : (e) => handleDragOver(e, tab.id)}
            onDragLeave={isAgent ? undefined : handleDragLeave}
            onDrop={isAgent ? undefined : (e) => handleDrop(e, tab.id)}
          >
            {editingTabId === tab.id ? (
              <input
                ref={editInputRef}
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={handleRenameKeyDown}
                className="bg-bg-tertiary text-text-primary px-1 text-xs w-24 border border-border rounded outline-none focus:border-accent"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className={`truncate max-w-32 flex items-center gap-1 ${tab.id === activeTabId ? 'border-b-2 border-accent pb-0.5' : ''}`}>
                {tab.isolated && <span className="text-blue-400 text-[9px] font-medium">[C]</span>}
                {tab.name}
              </span>
            )}
            {!isAgent && editingTabId !== tab.id && (
              <button
                className="opacity-0 group-hover:opacity-100 hover:text-text-primary rounded transition-opacity"
                onClick={(e) => handleCloseTab(e, tab.id)}
                title="Close tab"
              >
                <XIcon />
              </button>
            )}
          </div>
          )
        })}
      </div>

      {/* Add tab button */}
      <button
        className="flex items-center justify-center w-6 h-6 hover:text-text-primary transition-colors text-text-secondary flex-shrink-0"
        onClick={handleAddTab}
        title="New terminal tab"
      >
        <PlusIcon />
      </button>

      {/* Dropdown button - only shown when tabs overflow */}
      {isOverflowing && (
        <div className="relative flex-shrink-0" ref={dropdownRef}>
          <button
            className="flex items-center justify-center w-6 h-6 hover:text-text-primary transition-colors text-text-secondary"
            onClick={() => setShowDropdown(!showDropdown)}
            title="Show all tabs"
          >
            <ChevronDownIcon />
          </button>

          {/* Dropdown menu */}
          {showDropdown && (
            <div className="absolute right-0 top-full mt-1 bg-bg-secondary border border-border rounded shadow-lg z-50 min-w-48 max-h-64 overflow-y-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`
                    w-full px-3 py-2 text-left text-xs flex items-center gap-2
                    ${tab.id === activeTabId ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary'}
                  `}
                  onClick={() => handleDropdownSelect(tab.id)}
                >
                  {tab.id === activeTabId && <CheckIcon />}
                  <span className={tab.id === activeTabId ? '' : 'ml-5'}>{tab.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
