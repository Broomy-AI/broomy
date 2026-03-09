/**
 * Expandable section component with a title, optional count badge, and toggle arrow.
 */
import { useState } from 'react'

export function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string
  count?: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2 py-2 text-sm font-medium text-text-primary hover:bg-bg-tertiary/50 transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform text-text-secondary ${open ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span>{title}</span>
        {count !== undefined && count > 0 && (
          <span className="ml-auto px-1.5 py-0.5 text-xs rounded-full bg-bg-tertiary text-text-secondary">
            {count}
          </span>
        )}
      </button>
      {open && <div className="px-1.5 pb-2">{children}</div>}
    </div>
  )
}
