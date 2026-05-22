import { useState, useRef, useEffect } from 'react'

interface StagePillProps {
  currentStage: string
  allStages: string[]
  onSelect: (stage: string) => void
}

export function StagePill({ currentStage, allStages, onSelect }: StagePillProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs px-2 py-0.5 rounded-full bg-bg-tertiary text-text-secondary hover:text-text-primary border border-border flex items-center gap-1"
        aria-label={`Stage: ${currentStage}`}
      >
        <span>Stage:</span>
        <span className="text-text-primary font-medium">{currentStage}</span>
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full mt-1 z-10 min-w-[140px] bg-bg-secondary border border-border rounded shadow-lg py-1">
          {allStages.map(s => (
            <button
              key={s}
              role="menuitem"
              onClick={() => { onSelect(s); setOpen(false) }}
              className={`block w-full text-left px-3 py-1 text-xs hover:bg-bg-tertiary ${s === currentStage ? 'text-accent' : 'text-text-primary'}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
